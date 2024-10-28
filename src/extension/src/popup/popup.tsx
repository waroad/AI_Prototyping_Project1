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
  const [findRelatedFile, setFindRelatedFile] = useState(false);
  const [repo, setRepo] = useState(null);
  const [owner, setOwner] = useState(null);
  const [branch, setBranch] = useState(null);
  const [repoData, setRepoData] = useState(null);

  function parseURL(url) {
    const match = url.match(
      /github\.com\/([^\/]+)\/([^\/]+)(?:\/(tree|blob)\/([^\/]+))?/
    );
    if (!match) return null;

    const owner = match[1];
    const repo = match[2];
    const branch = match[4] || "main";
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
      return await response.json();
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
      .then(({ owner, repo }) => RepoIssueFetch(owner, repo))
      .then((res) => {
        // console.log(res);
        setRepoData(res);
      });
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
        filePathRequire: findRelatedFile,
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
        <label className="w-fit flex items-center gap-1 cursor-pointer">
          <span className="ms-3 font-medium text-slate-300">
            <b>find related files</b>
          </span>
          <input
            type="checkbox"
            value=""
            className="sr-only peer"
            checked={findRelatedFile}
            onClick={() => setFindRelatedFile((old) => !old)}
          />
          <div className="relative w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-focus:ring-4 peer-focus:ring-teal-300 dark:peer-focus:ring-teal-800 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-teal-600"></div>
        </label>
      </div>
      {GPTAnswer && (
        <div className="w-full p-3 my-2 bg-slate-700 text-slate-200 rounded-lg shadow">
          <MarkdownRenderer>{GPTAnswer}</MarkdownRenderer>
        </div>
      )}
      <div className="my-2" id="question-field-container">
        <form onSubmit={handleQuestion}>
          <div className="flex items-center bg-inherit">
            <textarea
              name="questionArea"
              rows={2}
              className="block mr-2 p-2.5 w-full text-sm resize-y text-gray-900 bg-white rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              placeholder={
                repo && owner && branch
                  ? `Ask about ${repo} by ${owner} in ${branch} branch...`
                  : "Ask about this repository..."
                // `Ask about ${repo} by ${owner} in ${branch} branch...`
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
