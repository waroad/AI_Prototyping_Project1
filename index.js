import { OpenAIEmbeddings } from "@langchain/openai";
import axios from "axios";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import "dotenv/config";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Document } from "langchain/document";
import pLimit from "p-limit"; // to fetch multiple files simultaneously (multiple asynchronous operations in parallel)

// To load, extract, and process content from GitHub repository
async function loadAndSplitDocuments() { 
  // TIME TEST: To test running time (uncomment to test) [seconds, nanoseconds]
  // const startTime = process.hrtime();

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
 
    // const docs = []; 
    const limit = pLimit(10); // Set limit of concurrent requests to 10 (recommended for performance)

    // Step 2: Fetch files concurrently
    const filePromises = files.map((file) => // Map files to promises 
      limit(async () => {
        // Fetch file content and process
        const fileUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${file.path}`;

        try {
          const fileResponse = await axios.get(fileUrl, { headers });
          const content = fileResponse.data.content;

          if (!content) {
            console.error(`No content for file ${file.path}`);
            return null;
          }

          const decodedContent = Buffer.from(content, "base64").toString("utf-8");

          // Create a document with the file content
          return new Document({
            pageContent: decodedContent,
            metadata: { source: file.path },
          });
        } catch (err) {
          console.error(`Error fetching file ${file.path}:`, err.message);
          return null;
        }
      })
    );
    // Wait for all promises to resolve
    const results = await Promise.all(filePromises);

    // Filter out any null results (error handling)
    const validDocs = results.filter((doc) => doc !== null);

    // Step 3: Split the documents using the splitter
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2048,
      chunkOverlap: 512,
    });

    const data = await splitter.splitDocuments(validDocs);
    // console.log(`Number of documents loaded: ${data.length}`); (for debugging)
    
   // TIME TEST: End the timer and log the elapsed time (uncomment to run)
  // const endTime = process.hrtime(startTime);
  // const elapsedTime = endTime[0] + endTime[1] / 1e9; // Convert to seconds
  // console.log(`loadAndSplitDocuments took ${elapsedTime.toFixed(3)} seconds`);
  return data;

    return data;

  } catch (err) {
    console.error("Error fetching repository contents:", err.message);
    
    // TIME TEST: End the timer even if there's an error (uncomment to run)
    // const endTime = process.hrtime(startTime);
    // const elapsedTime = endTime[0] + endTime[1] / 1e9;
    // console.log(`loadAndSplitDocuments failed after ${elapsedTime.toFixed(3)} seconds`);

    return [];
  }
}

// function to fetch the issues from past year using pagination
async function loadAndProcessIssues(githubOwner, githubRepo) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
  };

  // Helper function to get current date one year ago
  function getOneYearAgo() {
    const now = new Date();
    now.setFullYear(now.getFullYear() - 1);
    return now.toISOString();
  }

  // Fetch issues from the past year (pagination supported)
  async function getIssuesFromPastYear(page = 1, issues = []) {
    try {
      const oneYearAgo = getOneYearAgo();
      const response = await axios.get(
        `https://api.github.com/repos/${githubOwner}/${githubRepo}/issues?state=all&since=${oneYearAgo}&per_page=100&page=${page}`,
        { headers }
      );

      const data = response.data;
      issues = issues.concat(data);

      if (data.length === 100) {
        // Fetch next page if there are still more issues
        return getIssuesFromPastYear(page + 1, issues);
      } else {
        return issues;
      }
    } catch (error) {
      console.error("Error fetching issues:", error);
      return issues;
    }
  }

  // Fetch all issues from the past year
  const issues = await getIssuesFromPastYear();
  if (!issues) return [];

  // console.log(`Total Issues and Pull Requests from the past year: ${issues.length}`);

  // Convert issues into documents
  const issueDocs = issues.map((issue) => {
    const issueContent = `
    Issue Number: ${issue.number}
    Title: ${issue.title}
    State: ${issue.state}
    Created At: ${issue.created_at}
    Closed At: ${issue.closed_at || "N/A"}
    Labels: ${issue.labels.map((label) => label.name).join(", ")}
    Author: ${issue.user.login}
    Body: ${issue.body || "No description provided."}
    Comments: ${issue.comments}
    URL: ${issue.html_url}`;

    return new Document({
      pageContent: issueContent,
      metadata: { source: `issue_${issue.number}` },
    });
  });

  
  // Split the issue documents if needed
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 2048,
    chunkOverlap: 512,
  });

  const splitIssueDocs = await splitter.splitDocuments(issueDocs);
  // console.log(`Number of issue documents loaded: ${splitIssueDocs.length}`);


  return splitIssueDocs;
}

// The Vector store ingestion function
async function vectorIngestion(docs) {
  const embeddingFunction = new OpenAIEmbeddings();
  const vectorstore = new MemoryVectorStore(embeddingFunction);
  await vectorstore.addDocuments(docs);
  // console.log(`Number of documents ingested into vector store: ${docs.length}`);
  return vectorstore;
}

// Main RAG implementation
const githubOwner = "alirezamika"; // Name of Git Owner
const githubRepo = "autoscraper";   // Name of repository

// const data = await loadAndSplitDocuments();
// const vectorstore = await vectorIngestion(data);

// Load and process repository files
const repoDocs = await loadAndSplitDocuments(githubOwner, githubRepo);

// Load and process issues
const issueDocs = await loadAndProcessIssues(githubOwner, githubRepo);

// Combine all documents
const allDocs = [...repoDocs, ...issueDocs];

const vectorstore = await vectorIngestion(allDocs);

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
  content: `... If the user requests a list of items, provide a brief summary or list only a few examples. ...`,
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