import chalk from "chalk";
import { getPrompt } from "./src/ai.js";
import { getCollection, retrieveText } from "./src/rag.js";

const { text_collection, code_collection } = await getCollection(
  "microsoft",
  "CodeBERT",
  "master",
);

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
  const writing_context = await retrieveText(
    text_collection,
    `${question}`,
    12,
  );
  const coding_context = await retrieveText(code_collection, `${question}`, 4);

  const aiResponse = await prompt(
    `Answer this question <question> ${question} <question> 
    using this context
    <context> ${writing_context} <context>
    to answer it in terms of general understanding
    and use this coding context
    <coding_context> ${coding_context} <coding_context>
    to answer it when coding snippets are required.`,
  );
  console.log(chalk.magenta("AI: " + aiResponse.content));
  process.stdout.write("You: ");
});
