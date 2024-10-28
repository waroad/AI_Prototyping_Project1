import express from "express";
import "dotenv/config";
import {
  getCollection,
  retrieveText,
  getIssueCollection,
} from "./rag_utils.js";
import { getPrompt } from "./ai_utils.js";
import { gatherRepoInfoForPastYear } from "./github_utils.js";

const PORT = 3000;
const app = express();

const prompt = getPrompt([
  {
    role: "system",
    content: `You are an experienced developer, expert at
interpreting and answering questions based on provided documentation.
Using the provided context, answer the user's question to the
best of your ability using only the resources provided. Be sure
to provide a clear and concise answer. Reference the context in the answer if needed.
Be succinct and say "I do not know" if you do not know. format all your answers in markdown`,
  },
]);

let text_docs;
let code_docs;
let issue_docs;

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
    branch
  );
  text_docs = text_collection;
  code_docs = code_collection;
  res.sendStatus(200);
});

app.post("/askQuestion", async (req, res) => {
  const { question, filePathRequire } = req.body;
  // console.log(text_docs, code_docs);
  const writing_context = await retrieveText(text_docs, `${question}`, 8);
  const coding_context = await retrieveText(code_docs, `${question}`, 4);
  const issue_context = issue_docs
    ? await retrieveText(issue_docs, `${question}`, 4)
    : "none";
  // console.log(writing_context, coding_context);

  const aiResponse = await prompt(
    `Answer this question <question> ${question} <question> 
    using this context
    <context> ${writing_context} </context>
    to answer it in terms of general understanding
    and use this coding context
    <coding_context> ${coding_context} </coding_context>
    to answer it when coding snippets are required.

    reference to these issues if appropriate
    <issues> ${issue_context} </issues>

    please format your response in Markdown.`
  );
  console.log(aiResponse);
  res.status(200).send(aiResponse.content);
});

app.post("/fetchIssue", async (req, res) => {
  const { owner, repo } = req.body;
  const issue = await gatherRepoInfoForPastYear(owner, repo);
  issue_docs = await getIssueCollection(owner, repo);
  res.status(200).send(issue);
});

app.listen(PORT, () => {
  console.log(
    `[SERVER] ExpressJS is listening to port http://localhost:${PORT}]`
  );
});
