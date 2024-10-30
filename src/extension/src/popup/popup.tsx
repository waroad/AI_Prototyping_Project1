import React, { useEffect, useState } from "react";
import { MarkdownRenderer } from "../assets/markdown";
import "highlight.js/styles/github.css";
import "./popup.css";

const completeStatusDot = (
  <svg
    className="w-4 h-4 text-green-300"
    xmlns="http://www.w3.org/2000/svg"
    version="1.1"
  >
    <circle r="5" cx={8} cy={8} fill="currentColor" />
  </svg>
);

const waitingStatusDot = (
  <svg
    className="w-4 h-4 text-red-500"
    xmlns="http://www.w3.org/2000/svg"
    version="1.1"
  >
    <circle r="5" cx={8} cy={8} fill="currentColor" />
  </svg>
);

const Popup = () => {
  const [documentStatus, setDocumentStatus] = useState(null);
  const [GPTAnswer, setGPTAnswer] = useState(null);
  const [repo, setRepo] = useState(null);
  const [owner, setOwner] = useState(null);
  const [branch, setBranch] = useState(null);

  async function parseURL(url) {
    const match = url.match(
      /github\.com\/([^\/]+)\/([^\/]+)(?:\/(tree|blob)\/([^\/]+))?/
    );
    if (!match) return null;

    const owner = match[1];
    const repo = match[2];
    let branch = match[4];

    if (!branch) {
      const options = {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify({
          owner,
          repo,
        }),
      };
      const default_branch = await fetch(
        "http://localhost:3000/fetchDefaultBranch",
        options
      ).then((res) => res.text());
      branch = default_branch;
    }

    setRepo(repo);
    setOwner(owner);
    setBranch(branch);
    return { owner, repo, branch };
  }

  async function RepoCollectionFetch(owner, repo, branch) {
    const options = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify({
        owner,
        repo,
        branch,
      }),
    };
    const response = await fetch("http://localhost:3000/fetchDocs", options);
    if (response.status == 200) {
      return true;
    } else {
      return false;
    }
  }

  async function RepoIssueFetch(owner, repo) {
    const options = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify({
        owner,
        repo,
      }),
    };
    const response = await fetch("http://localhost:3000/fetchIssue", options);
    if (response.status == 200) {
      return true;
    } else {
      return false;
    }
  }

  function fetchDocuments() {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((res) => parseURL(res[0].url))
      .then(({ owner, repo, branch }) =>
        RepoCollectionFetch(owner, repo, branch)
      )
      .then((res) => setDocumentStatus(res));
  }

  function fetchRepoStatus() {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((res) => parseURL(res[0].url))
      .then(({ owner, repo }) => RepoIssueFetch(owner, repo));
  }

  function handleQuestion(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    const question = Object.fromEntries(formData.entries()).questionArea;
    setGPTAnswer("waiting...");

    const options = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify({
        question,
      }),
    };
    fetch("http://localhost:3000/askQuestion", options)
      .then((res) => res.text())
      .then((res) => {
        console.log(res);
        setGPTAnswer(res);
      });
  }

  useEffect(() => {
    fetchDocuments();
    fetchRepoStatus();
  }, []);

  return (
    <div className="border-8 border-transparent h-full">
      <h1 className="text-3xl text-slate-200 my-2">Github Explainer</h1>
      <div className="w-full flex justify-between">
        <div
          className="w-fit flex items-center gap-1 text-slate-300"
          id="status-bar"
        >
          {documentStatus ? completeStatusDot : waitingStatusDot}
          {!documentStatus && <b>waiting to fetch document...</b>}
          {documentStatus && <b>fetched documents</b>}
        </div>
      </div>
      {GPTAnswer && (
        <div className="w-full p-4 my-2 bg-slate-700 text-slate-200 rounded-lg shadow text-base">
          <MarkdownRenderer>{GPTAnswer}</MarkdownRenderer>
        </div>
      )}
      <div className="my-2" id="question-field-container">
        <form onSubmit={handleQuestion}>
          <div className="flex items-center bg-inherit">
            <textarea
              name="questionArea"
              rows={2}
              className="block mr-2 p-2.5 w-full text-base resize-y text-gray-900 bg-white rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              placeholder={
                repo && owner && branch
                  ? `Ask about ${repo} by ${owner} in ${branch} branch...`
                  : "Ask about this repository..."
              }
            ></textarea>
            <button
              type="submit"
              className="inline-flex justify-center p-3 text-slate-200 rounded-full cursor-pointer bg-gray-700 hover:bg-blue-100 dark:text-slate-200 dark:hover:bg-gray-600"
            >
              <svg
                className="w-5 h-5 rotate-90 rtl:-rotate-90"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 18 20"
              >
                <path d="m17.914 18.594-8-18a1 1 0 0 0-1.828 0l-8 18a1 1 0 0 0 1.157 1.376L8 18.281V9a1 1 0 0 1 2 0v9.281l6.758 1.689a1 1 0 0 0 1.156-1.376Z" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Popup;
