const OpenAI = require("openai");

let text_collection;
let code_collection;

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

self.addEventListener("message", async (event) => {
  console.log("in event");
  const data = event.data;

  if (data.action === "fetch_readme") {
    console.log("fetching");
    const repoURL = data.url;

    // const { text_collection, code_collection } = await fetchCollection(repoURL);
    const collection = await fetchCollection(repoURL);
    console.log("fetched");
    console.log(collection);
    text_collection = collection.text_collection;
    code_collection = collection.code_collection;
  } else if (data.action === "ask_question") {
    // User asks a question based on the already fetched README.md content
    const responseText = await answerQuestion(
      text_collection,
      code_collection,
      data.question,
    );
    self.postMessage(responseText);
  }
});

// Function to fetch README.md from a GitHub repo
async function fetchCollection(repoURL) {
  // const match = repoURL.match(
  //   /github\.com\/([^\/]+)\/([^\/]+)(?:\/(tree|blob)\/([^\/]+))?/,
  // );
  // if (!match) return null;

  // const owner = match[1];
  // const repo = match[2];
  // const branch = match[4] || "master";
  return await getCollection("microsoft", "CodeBERT", "master");
}

// Function to answer a question based on the README.md
async function answerQuestion(text_collection, code_collection, question) {
  const writing_context = await retrieveText(
    text_collection,
    `${question}`,
    12,
  );
  const coding_context = await retrieveText(code_collection, `${question}`, 4);

  return await prompt(
    `Answer this question <question> ${question} <question> 
    using this context
    <context> ${writing_context} <context>
    to answer it in terms of general understanding
    and use this coding context
    <coding_context> ${coding_context} <coding_context>
    to answer it when coding snippets are required.`,
  );
}

//ai functionality
const axios = require("axios/dist/node/axios.cjs");

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
        Authorization: `Bearer OPENAI_API_KEY`,
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
  };
}

//rag functionality
// const RecursiveCharacterTextSplitter = require("langchain/text_splitter");
// const Document = require("langchain/document");
// const { OpenAIEmbeddingFunction, ChromaClient } = require("chromadb");

const code_extension = ["py", "yml", "js"];
const skip_extension = ["zip"];

async function fetchRepo(repoURL) {
  const match = repoURL.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) return null;

  const owner = match[1];
  const reponame = match[2];
  const branch = match[3];

  return await getCollection(owner, reponame, branch);
}

async function getCollection(githubOwner, githubRepo, githubBranch = "main") {
  const { ChromaClient, OpenAIEmbeddingFunction } = await import(
    "chromadb/dist/main"
  );
  // const ChromaClient = await import("chromadb");
  // const OpenAIEmbeddingFunction = await import("chromadb");
  const name = [githubOwner, githubRepo, githubBranch].join("");
  const client = new ChromaClient("http://localhost:8000");

  const embeddingFunction = new OpenAIEmbeddingFunction({
    model: "text-embedding-3-small",
    encoding_format: "float",
    openai_api_key:
      "OPENAI_API_KEY",
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
  const { Document } = await import("langchain/document");
  const { RecursiveCharacterTextSplitter } = await import(
    "langchain/text_splitter"
  );
  const githubToken = process.env.GITHUB_TOKEN;

  // Step 1: Get all files in the GitHub repository
  const url = `https://api.github.com/repos/${githubOwner}/${githubRepo}/git/trees/${githubBranch}?recursive=1`;

  const headers = githubToken ? { Authorization: `token ${githubToken}` } : {};

  try {
    const response = await axios.get(url, { headers });
    const files = response.data.tree.filter((item) => item.type === "blob");

    const writing_context = [];
    const coding_context = [];

    // Step 2: Get content of each file then create documents
    for (const file of files) {
      const path = file.path;
      const type =
        path.split(".").length >= 2
          ? path.split(".")[path.split(".").length - 1]
          : "other";

      const fileUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${path}`;

      try {
        const fileResponse = await axios.get(fileUrl, { headers });
        const content = fileResponse.data.content;

        if (!content) {
          console.error(`No content for file ${path}`);
          continue;
        }

        const decodedContent = Buffer.from(content, "base64").toString("utf-8");

        // Create a document with the file content
        const doc = new Document({
          pageContent: decodedContent,
          metadata: { source: file.path },
        });

        if (code_extension.includes(type)) {
          coding_context.push(doc);
        } else {
          writing_context.push(doc);
        }
      } catch (err) {
        console.error(`Error fetching file ${file.path}:`, err.message);
      }
    }

    // Step 3: Split the documents using the splitter
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2048,
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

async function retrieveText(collection, question, nResults = 4) {
  const result = await collection.query({
    queryTexts: question,
    nResults,
  });
  // console.log(result.documents);
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
