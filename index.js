import "dotenv/config";
import axios from "axios";
import chalk from "chalk";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { UnstructuredLoader } from "@langchain/community/document_loaders/fs/unstructured";
import path from "path";

const ASSETS_DIR = path.resolve("assets");
const markdownPath = path.join(
  ASSETS_DIR,
  "telescope.nvim-master",
  "README.md",
);

const loader = new UnstructuredLoader(markdownPath, {
  apiKey: process.env.UNSTRUCTURED_API_KEY,
  apiUrl: process.env.UNSTRUCTURED_API_URL,
});

const data = await loader.load();

console.log(data);

/*
// Vector store ingestion
const embeddingFunction = new OpenAIEmbeddings();

const vectorstore = new MemoryVectorStore(embeddingFunction);

// prompt
const prompt = getPrompt([
  {
    role: "system",
    content: `You are an experienced developer, expert at
interpreting and answering questions based on provided documentation.
Using the provided context, answer the user's question to the
best of your ability using only the resources provided. Be sure
to provide a clear and concise answer. Do not mention the
provided context in your answer. Be succinct and say "I do not
know" if you do not know`,
  },
]);

await vectorstore.addDocuments(data);

// Vector store seasrch
process.stdout.write("You: ");

process.stdin.addListener("data", async (data) => {
  const question = data.toString().trim();
  const context = await vectorstore.similaritySearch(`${question}`, 1);

  const aiResponse = await prompt(`Use this context <context>${context}<context>
to answer this question using the above context: ${question}`);
  console.log(chalk.magenta("AI: " + aiResponse.content));
  process.stdout.write("You: ");
});
*/

//helpers

function getPrompt(thread = []) {
  return function (userPrompt, options = {}) {
    const url = "https://api.openai.com/v1/chat/completions";
    const promptMessage = {
      role: "user",
      content: userPrompt,
    };

    return axios({
      method: "post",
      url,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      data: {
        model: "gpt-4o-mini",
        max_tokens: 500,
        temperature: 0,
        ...options,
        messages: [...thread, promptMessage],
      },
    }).then((res) => {
      const choice = res.data.choices[0];
      if (choice.finish_reason === "stop") {
        thread.push(promptMessage);
        thread.push(choice.message);
        return choice.message;
      }
      throw new Error("No response from AI");
    });
  };
}
