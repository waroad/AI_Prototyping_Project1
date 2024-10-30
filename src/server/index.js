import express from "express";
import "dotenv/config";
import {
  getCollection,
  retrieveText,
  getIssueCollection,
} from "./rag_utils.js";
import { getPrompt } from "./ai_utils.js";
import {
  gatherRepoInfoForPastYear,
  getBranch,
  getFileTree,
} from "./github_utils.js";

const PORT = 3000;
const app = express();

let prompt;
let getPath = getPrompt();

let text_docs;
let code_docs;
let issue_docs;

let trees;

app.use(express.json());

app.post("/", (req, res) => {
  console.log(req.body);
  res.send("hello");
});

app.post("/fetchDefaultBranch", async (req, res) => {
  const { owner, repo } = req.body;
  const default_branch = await getBranch(owner, repo);
  res.status(200).send(default_branch);
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

  trees = await getFileTree(owner, repo, branch);
  const issue = await gatherRepoInfoForPastYear(owner, repo);
  prompt = getPrompt([
    {
      role: "system",
      content: `You are an experienced developer, expert at
interpreting and answering questions about the code documentation you read.
Using the provided context, answer the user's question to the
best of your ability using only the resources provided. Be sure
to provide a clear and concise answer and give extensive code example illustrations. Do not mention the reference in the answer.
Be succinct and say "I do not know" if you do not know. format all your answers in markdown`,
    },
    {
      role: "system",
      content: `Here is some necessary status of the repository in the last year.
<status>${issue}</status>
`,
    },
  ]);
  res.sendStatus(200);
});

app.post("/askQuestion", async (req, res) => {
  const { question } = req.body;

  const pathNum = 5;

  const filePathList = await getPath(
    `
According to this file tree <tree>${trees}</tree>, list up to ${pathNum} of the path most likely to find the
answer to the following question <question> ${question} </question>
Only use path provided in the tree. If there is less than ${pathNum} paths, just provide as available.
Give the answer in the format of an array ["path1", "path2", ..., "path${pathNum}"]. If the question is too general,
return an array of the whole tree. give only an array with no additional explanation texts.
`,
  ).then((res) => {
    return JSON.parse(res.content);
  });

  const writing_context = await retrieveText(
    text_docs,
    `${question}`,
    8,
    filePathList,
  );
  const coding_context = await retrieveText(
    code_docs,
    `${question}`,
    8,
    filePathList,
  );
  const issue_context = issue_docs
    ? await retrieveText(issue_docs, `${question}`, 3)
    : "none";

  const aiResponse = await prompt(
    `Answer this question <question> ${question} <question> 
    using this context
    <context> ${writing_context} </context>
    to answer it in terms of general understanding
    and use this coding context
    <coding_context> ${coding_context} </coding_context>
    to answer it when coding snippets are required.

    refer to these issues if appropriate
    <issues> ${issue_context} </issues>`,
  );

  // console.log(aiResponse);
  res.status(200).send(aiResponse.content);
});

app.post("/fetchIssue", async (req, res) => {
  const { owner, repo } = req.body;
  const issue = await gatherRepoInfoForPastYear(owner, repo);
  res.status(200);
});

app.listen(PORT, () => {
  console.log(
    `[SERVER] ExpressJS is listening to port http://localhost:${PORT}]`,
  );
});
