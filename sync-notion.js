const { execFileSync } = require("node:child_process");
const { Client } = require("@notionhq/client");

function readGit(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

function sanitizeCommitMessage(message) {
  return String(message || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N");
}

function resolveCommitMetadata(environment = process.env, gitReader = readGit) {
  const checkedOutHash = gitReader(["rev-parse", "HEAD"]);
  const commitHash = checkedOutHash || String(environment.COMMIT_HASH || "").trim();
  const commitMessage =
    String(environment.COMMIT_MESSAGE || "").trim() ||
    gitReader(["log", "-1", "--pretty=%B", "HEAD"]);
  const explicitUrl = String(environment.COMMIT_URL || "").trim();
  const serverUrl = String(environment.GITHUB_SERVER_URL || "").replace(/\/$/, "");
  const repository = String(environment.GITHUB_REPOSITORY || "").trim();
  const commitUrl =
    explicitUrl ||
    (serverUrl && repository && commitHash
      ? `${serverUrl}/${repository}/commit/${commitHash}`
      : "");

  return { commitHash, commitMessage, commitUrl };
}

async function run() {
  const token = process.env.NOTION_TOKEN || process.env.INPUT_NOTION_TOKEN || "";
  const commitsDb = process.env.NOTION_COMMITS_DB_ID || process.env.INPUT_NOTION_COMMITS_DB_ID || "";
  const tareasDb = process.env.NOTION_TAREAS_DB_ID || process.env.INPUT_NOTION_TAREAS_DB_ID || "";
  const metadata = resolveCommitMetadata();
  const commitMessage = sanitizeCommitMessage(metadata.commitMessage);
  const commitUrl = metadata.commitUrl;
  const commitHash = metadata.commitHash;

  console.log(`Procesando commit sanitizado: "${commitMessage}"`);

  const COMMITS_DB_ID = commitsDb.replace(/-/g, "").trim();
  const TAREAS_DB_ID = tareasDb.replace(/-/g, "").trim();

  const match = commitMessage.match(/([A-Z]+-\d+)/i);
  if (!match) {
    console.log("Omitiendo: No se detecto ningun ID de tarea.");
    return;
  }

  if (!commitHash || !commitUrl) {
    throw new Error("No se pudieron resolver el hash y la URL del commit.");
  }

  const taskId = match[1].toUpperCase();
  const numberId = Number.parseInt(taskId.split("-")[1], 10);
  console.log(`Buscando numericamente por ID limpio: ${numberId}...`);

  const notion = new Client({ auth: token });
  const existingCommit = await notion.databases.query({
    database_id: COMMITS_DB_ID,
    filter: {
      property: "Enlace del Commit",
      url: { equals: commitUrl }
    },
    page_size: 1
  });

  if (existingCommit?.results?.length) {
    console.log(`Commit ${commitHash.substring(0, 7)} ya sincronizado; no se duplica.`);
    return;
  }

  const queryResponse = await notion.databases.query({
    database_id: TAREAS_DB_ID,
    filter: {
      property: "ID",
      unique_id: { equals: numberId }
    },
    page_size: 1
  });

  if (!queryResponse || queryResponse.results.length === 0) {
    console.log(`Notion no encontro ninguna tarea con el numero ${numberId}.`);
    return;
  }

  const targetPageId = queryResponse.results[0].id;
  const shortHash = commitHash.substring(0, 7);
  console.log(`Tarea localizada. Creando registro del commit ${shortHash}...`);

  await notion.pages.create({
    parent: { database_id: COMMITS_DB_ID },
    properties: {
      Name: { title: [{ text: { content: `[${shortHash}]` } }] },
      "Enlace del Commit": { url: commitUrl },
      Fecha: { date: { start: new Date().toISOString().split("T")[0] } },
      "Tarea Asociada": { relation: [{ id: targetPageId }] }
    }
  });

  console.log(`Commit [${shortHash}] registrado correctamente.`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error("Error critico en la ejecucion:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  readGit,
  resolveCommitMetadata,
  sanitizeCommitMessage
};
