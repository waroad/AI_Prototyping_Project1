import axios from "axios";
import "dotenv/config";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "langchain/document";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { OpenAIEmbeddingFunction, ChromaClient } from "chromadb";
import pLimit from "p-limit";
import path from "path";
import { getIssuesFromPastYear } from "./github_utils.js";

const code_extension = [
  ".py",
  ".js",
  ".scala",
  "jsx",
  ".ts",
  ".ipynb",
  ".rs",
  ".pest",
];
const skip_extension = [".zip", ".jpg", ".png", ".mp3", ".mp4"];

export async function getCollection(
  githubOwner,
  githubRepo,
  githubBranch = "main",
) {
  const name = [githubOwner, githubRepo, githubBranch].join("");
  const client = new ChromaClient("http://localhost:8000");

  const embeddingFunction = new OpenAIEmbeddingFunction({
    model: "text-embedding-3-small",
    encoding_format: "float",
    openai_api_key: process.env.OPENAI_API_KEY,
  });

  let text_collection;
  let code_collection;
  try {
    text_collection = await client.getCollection({
      name: `${name}-text`,
      embeddingFunction,
    });

    code_collection = await client.getCollection({
      name: `${name}-code`,
      embeddingFunction,
    });
  } catch (error) {
    const { text_document, code_document } = await loadAndSplitDocuments(
      githubOwner,
      githubRepo,
      githubBranch,
    );
    // console.log(text_document, code_document);

    if (text_document == undefined || code_document == undefined) {
      throw new Error("not getting code or text");
    }

    text_collection = await client.createCollection({
      metadata: { "hnsw:space": "cosine" },
      name: `${name}-text`,
      embeddingFunction,
    });

    code_collection = await client.createCollection({
      metadata: { "hnsw:space": "cosine" },
      name: `${name}-code`,
      embeddingFunction,
    });

    await vectorIngestion(text_collection, text_document);
    await vectorIngestion(code_collection, code_document);
  }
  return { text_collection, code_collection };
}

async function loadAndSplitDocuments(githubOwner, githubRepo, githubBranch) {
  const githubToken = process.env.GITHUB_TOKEN;

  // Step 1: Get all files in the GitHub repository
  const url = `https://api.github.com/repos/${githubOwner}/${githubRepo}/git/trees/${githubBranch}?recursive=1`;

  const headers = githubToken ? { Authorization: `token ${githubToken}` } : {};

  try {
    const response = await axios.get(url, { headers });
    const files = response.data.tree.filter((item) => item.type === "blob");

    // const writing_context = [];
    // const coding_context = [];

    const limit = pLimit(10);

    const filePromises = files
      .filter((file) => !skip_extension.includes(path.extname(file.path)))
      .map(
        (
          file, // Map files to promises
        ) =>
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

              let decodedContent;

              if (path.extname(file.path) === ".pdf") {
                // decode base64 string, remove space for IE compatibility
                const binary = atob(content);
                const len = binary.length;
                const buffer = new ArrayBuffer(len);
                const view = new Uint8Array(buffer);
                for (var i = 0; i < len; i++) {
                  view[i] = binary.charCodeAt(i);
                }

                // create the blob object with content-type "application/pdf"
                const blob = new Blob([view], { type: "application/pdf" });
                const loader = new PDFLoader(blob);
                decodedContent = await loader
                  .load()
                  .then((res) => res.pageContent);
              } else {
                decodedContent = Buffer.from(content, "base64").toString(
                  "utf-8",
                );
              }

              // Create a document with the file content
              return new Document({
                pageContent: decodedContent,
                metadata: { source: file.path },
              });
            } catch (err) {
              console.error(`Error fetching file ${file.path}:`, err.message);
              return null;
            }
          }),
      );

    const results = await Promise.all(filePromises);
    const validDocs = results.filter((doc) => doc !== null);

    const writing_context = validDocs.filter((doc) => {
      const docPath = doc.metadata["source"];
      const type = path.extname(docPath);
      const result =
        !code_extension.includes(type) && !skip_extension.includes(type);
      return result;
    });

    const coding_context = validDocs.filter((doc) => {
      const docPath = doc.metadata["source"];
      const type = path.extname(docPath);
      const result = code_extension.includes(type);
      return result;
    });

    // Step 3: Split the documents using the splitter
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 4096,
      chunkOverlap: 512,
    });

    const writing_data = await splitter.splitDocuments(writing_context);
    const coding_data = await splitter.splitDocuments(coding_context);
    const data = { text_document: writing_data, code_document: coding_data };
    return data;
  } catch (err) {
    console.error("Error fetching repository contents:", err.message);
    return { text_document: [], code_document: [] };
  }
}

export async function getIssueCollection(githubOwner, githubRepo) {
  const name = [githubOwner, githubRepo].join("");
  const client = new ChromaClient("http://localhost:8000");
  const embeddingFunction = new OpenAIEmbeddingFunction({
    model: "text-embedding-3-small",
    encoding_format: "float",
    openai_api_key: process.env.OPENAI_API_KEY,
  });
  let issue_collection;
  try {
    issue_collection = await client.getCollection({
      name: `${name}-issue`,
      embeddingFunction,
    });
  } catch (error) {
    //splitting new issue
    const issues = await getIssuesFromPastYear(githubOwner, githubRepo);
    const issueDocument = issues.map((issue) => {
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

    const issue_document = await splitter.splitDocuments(issueDocument);

    // make collection for the new issue collection
    issue_collection = await client.createCollection({
      metadata: { "hnsw:space": "cosine" },
      name: `${name}-issue`,
      embeddingFunction,
    });
    await vectorIngestion(issue_collection, issue_document);
  }
  return issue_collection;
}

export async function retrieveText(collection, question, nResults = 4, paths) {
  const result = await collection.query({
    queryTexts: question,
    nResults,
    where: { source: { $in: paths } },
  });
  const context = result.documents.join(" ");
  return context;
}

async function vectorIngestion(collection, docs) {
  docs.forEach(async (document, i) => {
    await collection.add({
      ids: [`${i}`],
      documents: [
        `the below document ${i} is from ${document.metadata.source} path\n` +
          `<document ${i}>\n ${document.pageContent}\n </document ${i}>`,
      ],
      metadatas: [document.metadata],
    });
  });
}
