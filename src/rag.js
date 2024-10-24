import axios from "axios";
import "dotenv/config";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "langchain/document";
import { OpenAIEmbeddingFunction, ChromaClient } from "chromadb";
const code_extension = ["py"];

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
  try {
    const response = await axios.get(url, { headers });
    const files = response.data.tree.filter((item) => item.type === "blob");

    const writing_context = [];
    const coding_context = [];

    // Step 2: Get content of each file then create documents
    for (const file of files) {
      const path = file.path;
      const type = path.split(".").length == 2 ? path.split(".")[1] : "other";

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

function deleteCollection(name) {
  const client = new ChromaClient("http://localhost:8000");
  return client.deleteCollection({ name });
}

export async function retrieveText(collection, question, nResults = 4) {
  const result = await collection.query({
    queryTexts: question,
    nResults,
  });
  const context = result.documents.join(" ");
  return context;
}

async function vectorIngestion(collection, docs) {
  docs.forEach(async (document, i) => {
    await collection.add({
      ids: [`${i}`],
      documents: [document.pageContent],
    });
  });
}
