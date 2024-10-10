import { OpenAIEmbeddings } from "@langchain/openai";
import axios from "axios";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import "dotenv/config";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Document } from "langchain/document";

// To load, extract, and process content from GitHub repository
async function loadAndSplitDocuments() {
  const githubOwner = "alirezamika"; // Name of Git Owner
  const githubRepo = "autoscraper";   // Name of repository 
  const githubBranch = "master"; // Name of branch to use
  const githubToken = process.env.GITHUB_TOKEN;

  // Step 1: Get all files in the GitHub repository
  const url = `https://api.github.com/repos/${githubOwner}/${githubRepo}/git/trees/${githubBranch}?recursive=1`;

  const headers = githubToken
    ? { Authorization: `token ${githubToken}` }
    : {};

  try {
    const response = await axios.get(url, { headers });
    const files = response.data.tree.filter((item) => item.type === "blob");
 
    const docs = []; 

    // Step 2: Get content of each file then create documents
    for (const file of files) {
      const fileUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${file.path}`;

      try {
        const fileResponse = await axios.get(fileUrl, { headers });
        const content = fileResponse.data.content;

        if (!content) {
          console.error(`No content for file ${file.path}`);
          continue;
        }

        const decodedContent = Buffer.from(content, 'base64').toString('utf-8');

        // Create a document with the file content
        const doc = new Document({
          pageContent: decodedContent,
          metadata: { source: file.path },
        });

        docs.push(doc);
      } catch (err) {
        console.error(`Error fetching file ${file.path}:`, err.message);
      }
    }

    // Step 3: Split the documents using the splitter
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2048,
      chunkOverlap: 512,
    });

    const data = await splitter.splitDocuments(docs);
    return data;

  } catch (err) {
    console.error("Error fetching repository contents:", err.message);
    return [];
  }
}

// The Vector store ingestion function
async function vectorIngestion(docs) {
  const embeddingFunction = new OpenAIEmbeddings();
  const vectorstore = new MemoryVectorStore(embeddingFunction);
  await vectorstore.addDocuments(docs);
  return vectorstore;
}

// Main RAG implementation
const data = await loadAndSplitDocuments();
const vectorstore = await vectorIngestion(data);

// Q&A assistant setup
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

process.stdout.write("You: ");
process.stdin.addListener("data", async (inputData) => {
  const question = inputData.toString().trim();
  const contextDocs = await vectorstore.similaritySearch(`${question}`, 16);
  const context = contextDocs.map(({ pageContent }) => pageContent).join("\n");

  const aiResponse = await prompt(
    `Use this context <context>${context}<context> to answer this question using the above context: ${question}`,
  );
  console.log(chalk.magenta("AI: " + aiResponse.content));
  process.stdout.write("You: ");
});

// Get prompt function (unchanged)
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
        model: "gpt-4",
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

// (For debugging) to test pdf 
// import express from "express";

// const app = express();
// const PORT = 3000;

// app.get("/view-pdf", (req, res) => {
//   res.sendFile(pdfPath, { root: "." });
// });

// app.listen(PORT, () => {
//   console.log(`Server running at http://localhost:${PORT}/view-pdf`);
// });