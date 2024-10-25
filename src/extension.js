import { fetchRepo, retrieveText } from "./rag.js";
import { OpenAI } from "openai";

const thread = [];

self.addEventListener("message", async (event) => {
  const data = event.data;

  if (data.action === "fetch_readme") {
    const repoURL = data.url;

    const { text_collection, code_collection } = await fetchRepo(repoURL);

    if (readmeContent) {
      // Store the README.md content in the worker for further use
      self.readmeContent = readmeContent;
      console.log(readmeContent);
      self.postMessage("README.md fetched and ready to answer questions.");
    } else {
      self.postMessage("No README.md found or unable to fetch.");
    }
  } else if (data.action === "ask_question") {
    // User asks a question based on the already fetched README.md content
    if (!self.readmeContent) {
      self.postMessage("README.md content not available.");
      return;
    }

    await answerQuestion(data.key, self.readmeContent, data.question);
    // self.postMessage(responseText);
    thread.map((value) =>
      self.postMessage(`${value.role}: ${value.content}\n`),
    );
  }
});

// Function to answer a question based on the README.md
async function answerQuestion(key, collection, question) {
  const openai = new OpenAI({
    apiKey: key,
    dangerouslyAllowBrowser: true,
  });

  const { text_collection, code_collection } = collection;
  const writing_context = await retrieveText(
    text_collection,
    `${question}`,
    12,
  );
  const coding_context = await retrieveText(code_collection, `${question}`, 4);

  const promptMessage = {
    role: "user",
    content: `Answer this question <question> ${question} <question> 
    using this context
    <context> ${writing_context} <context>
    to answer it in terms of general understanding
    and use this coding context
    <coding_context> ${coding_context} <coding_context>
    to answer it when coding snippets are required.`,
  };

  // const completion = await openai.chat.completions
  await openai.chat.completions
    .create({
      model: "gpt-4o-mini",
      messages: [...thread, promptMessage],
    })
    .then((res) => {
      const choice = res.data.choices[0];
      if (choice.finish_reason === "stop") {
        const thread_length = thread.reduce((a, c) => a + c.length, 0);
        if (thread_length > 30000) {
          thread.shift();
        }
        thread.push(promptMessage);
        thread.push(choice.message);
        return choice.message;
      }
      throw new Error("No response from AI");
    });
}
