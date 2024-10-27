import express from "express";
import "dotenv/config";
import { getCollection, retrieveText } from "./rag_utils.js";
import { getPrompt } from "./ai_utils.js";

const PORT = 3000;
const app = express();

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

let text_docs;
let code_docs;

app.use(express.json());

app.post("/", (req, res) => {
  console.log(req.body);
  res.send("hello");
});

app.post("/fetchDocs", async (req, res) => {
  const { owner, repo, branch } = req.body;
  const { text_collection, code_collection } = await getCollection(
    owner,
    repo,
    branch,
  );
  text_docs = text_collection;
  code_docs = code_collection;
  res.sendStatus(200);
});

app.post("/askQuestion", async (req, res) => {
  const { question, filePathRequire } = req.body;
  // console.log(text_docs, code_docs);
  const writing_context = await retrieveText(text_docs, `${question}`, 4);
  const coding_context = await retrieveText(code_docs, `${question}`, 4);
  // console.log(writing_context, coding_context);

  const aiResponse = await prompt(
    `Answer this question <question> ${question} <question> 
    using this context
    <context> ${writing_context} <context>
    to answer it in terms of general understanding
    and use this coding context
    <coding_context> ${coding_context} <coding_context>
    to answer it when coding snippets are required.

    please format your response in Markdown.`,
  );
  console.log(aiResponse);
  res.status(200).send(aiResponse.content);
});

app.listen(PORT, () => {
  console.log(
    `[SERVER] ExpressJS is listening to port http://localhost:${PORT}]`,
  );
});
