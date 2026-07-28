const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveCommitMetadata,
  sanitizeCommitMessage
} = require("../sync-notion.js");

function createGitReader(responses) {
  return (args) => responses[args.join(" ")] || "";
}

test("uses push event message and URL with the checked out commit hash", () => {
  const metadata = resolveCommitMetadata(
    {
      COMMIT_MESSAGE: "TASK-155: mejora importaciones",
      COMMIT_URL: "https://github.com/dramoon/economia-familiar/commit/event-sha",
      COMMIT_HASH: "event-sha"
    },
    createGitReader({ "rev-parse HEAD": "checked-out-sha" })
  );

  assert.deepEqual(metadata, {
    commitMessage: "TASK-155: mejora importaciones",
    commitUrl: "https://github.com/dramoon/economia-familiar/commit/event-sha",
    commitHash: "checked-out-sha"
  });
});

test("falls back to the checked out commit for workflow_dispatch", () => {
  const metadata = resolveCommitMetadata(
    {
      COMMIT_MESSAGE: "",
      COMMIT_URL: "",
      COMMIT_HASH: "workflow-sha",
      GITHUB_SERVER_URL: "https://github.com/",
      GITHUB_REPOSITORY: "dramoon/economia-familiar"
    },
    createGitReader({
      "rev-parse HEAD": "release-sha",
      "log -1 --pretty=%B HEAD": "Release v0.42.0: TASK-155 - mejora importaciones"
    })
  );

  assert.deepEqual(metadata, {
    commitMessage: "Release v0.42.0: TASK-155 - mejora importaciones",
    commitUrl: "https://github.com/dramoon/economia-familiar/commit/release-sha",
    commitHash: "release-sha"
  });
});

test("keeps metadata empty when neither the event nor Git can provide it", () => {
  const metadata = resolveCommitMetadata({}, createGitReader({}));

  assert.deepEqual(metadata, {
    commitMessage: "",
    commitUrl: "",
    commitHash: ""
  });
});

test("sanitizes accents without removing the task identifier", () => {
  assert.equal(
    sanitizeCommitMessage("Versión: TASK-155 - revisión"),
    "Version: TASK-155 - revision"
  );
});
