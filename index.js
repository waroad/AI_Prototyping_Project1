import { UnstructuredLoader } from "@langchain/community/document_loaders/fs/unstructured";
import { OpenAIEmbeddings } from "@langchain/openai";
import { readFileSync } from "fs";
import axios from "axios";
import chalk from "chalk";
import "dotenv/config";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import path from "path";

const ASSETS_DIR = path.resolve("assets");
const markdownPath = path.join(ASSETS_DIR, "autoscraper-master", "README.md");
const srcPath = path.join(
  ASSETS_DIR,
  "autoscraper-master",
  "autoscraper",
  "auto_scraper.py",
);

const markdown_data = await loadAndSplitMarkdown(markdownPath);
const code_data = await loadAndSplitSrc(srcPath);
const markdown_vectorstore = await vectorIngestion(markdown_data);
const code_vectorstore = await vectorIngestion(code_data);

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

// Vector store seasrch
process.stdout.write("You: ");

process.stdin.addListener("data", async (data) => {
  const question = data.toString().trim();
  const docs_retrieve = await markdown_vectorstore.similaritySearch(
    `${question}`,
    16,
  );
  const code_retrieve = await code_vectorstore.similaritySearch(
    `${question}`,
    4,
  );
  // console.log(code_retrieve);
  const contextDocs = docs_retrieve
    .map(({ pageContent }) => pageContent)
    .join("\n");
  const contextCode = code_retrieve
    .map(({ pageContent }) => pageContent)
    .join("\n");
  // console.log(contextDocs);
  // console.log(contextCode);

  const aiResponse = await prompt(
    `Answer this question <question> ${question} <question> using this contextDocs <contextDocs>${contextDocs}<contextDocs> to answer it regarding the document and use contextCode <contextCode>${contextCode}<contextCode> to answer it regarding the code`,
  );
  console.log(chalk.magenta("AI: " + aiResponse.content));
  process.stdout.write("You: ");
});

//helpers

async function loadAndSplitMarkdown(filepath) {
  const loader = new UnstructuredLoader(filepath, {
    apiKey: process.env.UNSTRUCTURED_API_KEY,
    apiUrl: process.env.UNSTRUCTURED_API_URL,
    chunkingStrategy: "by_title",
  });

  const README = await loader.load();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 2048,
    chunkOverlap: 512,
  });

  const data = await splitter.splitDocuments(README);
  return data;
}

async function loadAndSplitSrc(filepath) {
  const pythonfile = readFileSync(filepath, "utf-8");
  // console.log(pythonfile);

  const splitter = RecursiveCharacterTextSplitter.fromLanguage("python", {
    chunkSize: 1024,
    chunkOverlap: 256,
  });

  const data = await splitter.createDocuments([pythonfile]);
  // console.log(data);
  return data;
}

async function vectorIngestion(docs) {
  const embeddingFunction = new OpenAIEmbeddings();
  const vectorstore = new MemoryVectorStore(embeddingFunction);
  await vectorstore.addDocuments(docs);
  return vectorstore;
}

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
        model: "gpt-4o",
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
