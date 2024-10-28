import axios from "axios";
import "dotenv/config";

// GitHub personal access token for authentication
// GitHub personal access token for authentication
const GITHUB_TOKEN = `${process.env.GITHUB_TOKEN}`; // Replace with your GitHub Token

// Helper function to get current date one year ago
function getOneYearAgo() {
  const now = new Date();
  now.setFullYear(now.getFullYear() - 1);
  return now.toISOString();
}

// Fetch issues from the past year (pagination supported)
export async function getIssuesFromPastYear(
  repo_owner,
  repo_name,
  headers,
  page = 1,
  issues = []
) {
  try {
    const oneYearAgo = getOneYearAgo();
    const response = await axios.get(
      `https://api.github.com/repos/${repo_owner}/${repo_name}/issues?state=all&since=${oneYearAgo}&per_page=100&page=${page}`,
      { headers }
    );

    const data = response.data;
    issues = issues.concat(data);

    if (data.length === 100) {
      // Fetch next page if there are still more issues
      return getIssuesFromPastYear(
        repo_owner,
        repo_name,
        headers,
        page + 1,
        issues
      );
    } else {
      return issues;
    }
  } catch (error) {
    console.error("Error fetching issues:", error);
    return issues;
  }
}

// Function to get issue comments
async function getIssueComments(repo_owner, repo_name, headers, issueNumber) {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${repo_owner}/${repo_name}/issues/${issueNumber}/comments`,
      { headers }
    );
    return response.data;
  } catch (error) {
    console.error(`Error fetching comments for issue ${issueNumber}:`, error);
  }
}

// Function to check if a pull request has been merged
async function isPullRequestMerged(repo_owner, repo_name, headers, pullNumber) {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${repo_owner}/${repo_name}/pulls/${pullNumber}/merge`,
      { headers }
    );
    return response.status === 204;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return false;
    } else {
      console.error(
        `Error checking if pull request ${pullNumber} is merged:`,
        error
      );
    }
  }
}

// Main function to gather info from the past year
export async function gatherRepoInfoForPastYear(repo_owner, repo_name) {
  const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
  };
  console.log(
    `Gathering information for repo: ${repo_owner}/${repo_name} (Past Year)`
  );

  // Get all issues from the past year (with pagination)
  const issues = await getIssuesFromPastYear(repo_owner, repo_name, headers);
  if (!issues) return;

  //   console.log(
  //     `Total Issues and Pull Requests from the past year: ${issues.length}`
  //   );

  // Filter real issues and pull requests
  const realIssues = issues.filter((issue) => !issue.pull_request);
  const pullRequests = issues.filter((issue) => issue.pull_request);

  // Further separate open and closed issues
  const openIssues = realIssues.filter((issue) => issue.state === "open");
  const closedIssues = realIssues.filter((issue) => issue.state === "closed");

  // Further separate open and closed pull requests
  const openPullRequests = pullRequests.filter((pr) => pr.state === "open");
  const closedPullRequests = pullRequests.filter((pr) => pr.state === "closed");

  //   console.log(`Total Issues: ${realIssues.length}`);
  //   console.log(`Open Issues: ${openIssues.length}`);
  //   console.log(`Closed Issues: ${closedIssues.length}`);

  //   console.log(`Total Pull Requests: ${pullRequests.length}`);
  //   console.log(`Open Pull Requests: ${openPullRequests.length}`);
  //   console.log(`Closed Pull Requests: ${closedPullRequests.length}`);

  // Calculate average time to close an issue
  let totalCloseTimeIssues = 0;
  let closedIssueCount = 0;

  for (let issue of closedIssues) {
    const issueCreationTime = new Date(issue.created_at);
    const issueCloseTime = new Date(issue.closed_at);
    const closeTime = issueCloseTime.getTime() - issueCreationTime.getTime(); // in milliseconds
    totalCloseTimeIssues += closeTime;
    closedIssueCount++;
  }

  const avgCloseTimeIssues =
    totalCloseTimeIssues / closedIssueCount / (1000 * 60 * 60); // Convert to hours
  //   console.log(
  //     `Average time to close an issue: ${avgCloseTimeIssues.toFixed(2)} hours`
  //   );

  // Calculate average time to close a pull request
  let totalCloseTimePRs = 0;
  let closedPRCount = 0;
  let mergedPRCount = 0;

  for (let pr of closedPullRequests) {
    const prCreationTime = new Date(pr.created_at);
    const prCloseTime = new Date(pr.closed_at);
    const closeTime = prCloseTime.getTime() - prCreationTime.getTime(); // in milliseconds
    totalCloseTimePRs += closeTime;
    closedPRCount++;

    const prNumber = pr.number;
    const isMerged = await isPullRequestMerged(
      repo_owner,
      repo_name,
      headers,
      prNumber
    ); // Check if the pull request has been merged
    if (isMerged) {
      mergedPRCount++;
    }
  }

  const avgCloseTimePRs = totalCloseTimePRs / closedPRCount / (1000 * 60 * 60); // Convert to hours
  //   console.log(
  //     `Average time to close a pull request: ${avgCloseTimePRs.toFixed(2)} hours`
  //   );
  //   console.log(
  //     `Percentage of pull requests merged: ${(
  //       (mergedPRCount / closedPRCount) *
  //       100
  //     ).toFixed(2)}%`
  //   );

  const dataToReturn = {
    totalIssue: realIssues.length,
    openIssue: openIssues.length,
    closedIssue: closedIssues.length,
    pullRequest: pullRequests.length,
    openPullRequest: openPullRequests.length,
    closedPullRequests: closedPullRequests.length,
    avgTimeToCloseIssue: avgCloseTimeIssues.toFixed(2),
    avgTimeToClosePullRequest: avgCloseTimePRs.toFixed(2),
    percentPullReqeustMerged: ((mergedPRCount / closedPRCount) * 100).toFixed(
      2
    ),
  };

  // Calculate how long it took for the first comment (open issues)
  let totalResponseTimes = 0;
  let responseCount = 0;

  for (let issue of openIssues) {
    const comments = await getIssueComments(
      repo_owner,
      repo_name,
      headers,
      issue.number
    );
    if (comments && comments.length > 0) {
      const firstCommentTime = new Date(comments[0].created_at);
      const issueCreationTime = new Date(issue.created_at);
      const responseTime =
        firstCommentTime.getTime() - issueCreationTime.getTime(); // in milliseconds

      totalResponseTimes += responseTime;
      responseCount++;
    }
  }

  if (responseCount > 0) {
    const avgResponseTime =
      totalResponseTimes / responseCount / (1000 * 60 * 60); // Convert to hours
    dataToReturn["avgResponseTime"] = avgResponseTime;
    // console.log(
    //   `Average time to first comment on open issues: ${avgResponseTime.toFixed(
    //     2
    //   )} hours`
    // );
  } else {
    dataToReturn["avgResponseTime"] = 0;
    // console.log("No comments found on open issues from the past year.");
  }

  // Calculate percentage of closed issues and pull requests
  const issueClosePercentage = (closedIssues.length / realIssues.length) * 100;
  const prClosePercentage =
    (closedPullRequests.length / pullRequests.length) * 100;
  dataToReturn["issueClosePercentage"] = issueClosePercentage.toFixed(2);
  dataToReturn["prClosePercentage"] = prClosePercentage.toFixed(2);

  //   console.log(
  //     `Percentage of issues closed in the past year: ${issueClosePercentage.toFixed(
  //       2
  //     )}%`
  //   );
  //   console.log(
  //     `Percentage of pull requests closed in the past year: ${prClosePercentage.toFixed(
  //       2
  //     )}%`
  //   );

  // Calculate average number of comments per issue and pull request
  const totalCommentsOnIssues = realIssues.reduce(
    (sum, issue) => sum + issue.comments,
    0
  );
  const totalCommentsOnPRs = pullRequests.reduce(
    (sum, pr) => sum + pr.comments,
    0
  );
  const avgCommentsOnIssues = totalCommentsOnIssues / realIssues.length;
  const avgCommentsOnPRs = totalCommentsOnPRs / pullRequests.length;

  //   console.log(
  //     `Average number of comments per issue: ${avgCommentsOnIssues.toFixed(2)}`
  //   );
  //   dataToReturn["avgCommentsOnIssues"] = avgCommentsOnIssues.toFixed(2);
  //   console.log(
  //     `Average number of comments per pull request: ${avgCommentsOnPRs.toFixed(
  //       2
  //     )}`
  //   );

  // Bug issue ratio
  const bugIssues = realIssues.filter((issue) =>
    issue.labels.some((label) => label.name.toLowerCase() === "bug")
  );
  const bugIssuePercentage = (bugIssues.length / realIssues.length) * 100;

  //   console.log(
  //     `Percentage of issues labeled 'bug': ${bugIssuePercentage.toFixed(2)}%`
  //   );
  dataToReturn["bugIssuePercentage"] = bugIssuePercentage.toFixed(2);
  //   console.log(dataToReturn);

  return dataToReturn;
}
