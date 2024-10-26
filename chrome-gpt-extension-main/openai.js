const OpenAI = require("openai");
const axios = require("axios/dist/browser/axios.cjs");
const url = "http://localhost:3000/";

self.addEventListener("message", async (event) => {
  const data = event.data;

  if (data.action === "fetch_readme") {
    const repoURL = data.url;

    const readmeContent = await fetchReadme(repoURL);

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

    // const responseText = await answerQuestion(
    //   data.key,
    //   self.readmeContent,
    //   data.question,
    // );
    const options = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify({
        question: data.question,
      }),
    };
    const responseText = await fetch(`${url}askQuestion`, options).then((res) =>
      res.text(),
    );
    console.log(responseText);

    self.postMessage(responseText);
  }
});

// Function to fetch README.md from a GitHub repo
async function fetchReadme(repoURL) {
  try {
    const match = repoURL.match(
      /github\.com\/([^\/]+)\/([^\/]+)(?:\/(tree|blob)\/([^\/]+))?/,
    );
    if (!match) return null;

    const owner = match[1];
    const repo = match[2];
    const branch = match[4] || "main"; // If no branch is present, default branch

    const options = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify({
        owner,
        repo,
        branch,
      }),
    };
    console.log(owner, repo, branch);
    // const readmeURL = `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`;
    // const response = await fetch(readmeURL);
    const response = await fetch(`${url}fetchDocs`, options);
    console.log(response);
    // const readmeURL = `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`;
    // const response = await fetch(readmeURL);

    if (!response.ok) {
      console.log("Failed to fetch README.md:", response.statusText);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error("Error fetching README.md:", error);
    return null;
  }
}

// Function to answer a question based on the README.md
async function answerQuestion(key, readmeContent, question) {
  const openai = new OpenAI({
    apiKey: key,
    dangerouslyAllowBrowser: true,
  });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      {
        role: "user",
        content: `Here is the README.md content:\n\n${readmeContent}\n\nThe user has the following question: "${question}". Answer based on the README.`,
      },
    ],
  });

  return completion.choices[0].message.content;
}
