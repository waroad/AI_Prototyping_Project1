const askButton = document.getElementById('ask');
const response = document.getElementById('response');
const worker = new Worker(chrome.runtime.getURL('bundle.js'));


worker.onmessage = function (event) {
    response.textContent = event.data;
};

// Fetch README.md content automatically when the popup opens
window.onload = async function () {
    let key = await chrome.storage.local.get('OPENAI_API_KEY');

    // Get the current tab's URL
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs.length > 0) {
            let currentURL = tabs[0].url;
            console.log("Fetching README.md for URL:", currentURL);

            // Automatically fetch the README.md content
            worker.postMessage({ action: 'fetch_readme', key: key.OPENAI_API_KEY, url: currentURL });
        } else {
            console.log("No active tabs found.");
        }
    });
};

// Ask a question when the "Ask" button is clicked
askButton.onclick = async function () {
    const question = document.getElementById('question').value;

    let key = await chrome.storage.local.get('OPENAI_API_KEY');

    // Send the question and the stored README.md content to the worker
    worker.postMessage({ action: 'ask_question', key: key.OPENAI_API_KEY, question: question });
};
