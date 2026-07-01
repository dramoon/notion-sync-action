const { Client } = require('@notionhq/client');

async function run() {
  const token = process.env.NOTION_TOKEN || process.env.INPUT_NOTION_TOKEN || "";
  const commitsDb = process.env.NOTION_COMMITS_DB_ID || process.env.INPUT_NOTION_COMMITS_DB_ID || "";
  const tareasDb = process.env.NOTION_TAREAS_DB_ID || process.env.INPUT_NOTION_TAREAS_DB_ID || "";

  // Sanitizamos el mensaje eliminando tildes y eñes conflictivas para evitar descuadres de bytes en HTTP
  let rawCommitMessage = process.env.COMMIT_MESSAGE || "";
  const commitMessage = rawCommitMessage
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quita tildes
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N");

  const commitUrl = process.env.COMMIT_URL || "";
  const commitHash = process.env.COMMIT_HASH || "";

  console.log(`Procesando commit sanitizado: "${commitMessage}"`);

  const COMMITS_DB_ID = commitsDb.replace(/-/g, "").trim();
  const TAREAS_DB_ID = tareasDb.replace(/-/g, "").trim();

  const match = commitMessage.match(/([A-Z]+-\d+)/i);
  if (!match) {
    console.log("⚠️ Omitiendo: No se detectó ningún ID de tarea.");
    return;
  }

  const taskId = match[1].toUpperCase(); 
  const numberId = parseInt(taskId.split('-')[1], 10);
  console.log(`🔍 Buscando numéricamente por ID limpio: ${numberId}...`);

  try {
    const notion = new Client({ auth: token });
    
    const queryResponse = await notion.databases.query({
      database_id: TAREAS_DB_ID,
      filter: { 
        property: 'ID', 
        unique_id: { 
          equals: numberId 
        } 
      },
      page_size: 1
    });

    if (!queryResponse || queryResponse.results.length === 0) {
      console.log(`⚠️ Alerta: Notion no encontró ninguna tarea con el número ${numberId}.`);
      return;
    }

    const targetPageId = queryResponse.results[0].id;
    console.log(`✅ Tarea localizada (Page ID: ${targetPageId}). Creando registro de commit...`);
    
    const shortHash = commitHash ? commitHash.substring(0, 7) : "Commit";

    // Grabación limpia en la tabla de Commits (usando también el mensaje limpio)
    await notion.pages.create({
      parent: { database_id: COMMITS_DB_ID },
      properties: {
        'Name': { title: [{ text: { content: `[${shortHash}] ${commitMessage.substring(0, 40)}...` } }] },
        'Enlace del Commit': { url: commitUrl },
        'Fecha': { date: { start: new Date().toISOString().split('T')[0] } },
        'Tarea Asociada': { relation: [{ id: targetPageId }] }
      }
    });

    console.log(`✅ ¡Éxito total! Commit [${shortHash}] registrado.`);

  } catch (error) {
    console.error("❌ Error crítico en la ejecución:", error.message);
    process.exit(1);
  }
}

run();
