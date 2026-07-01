const { Client } = require('@notionhq/client');

async function run() {
  const token = process.env.NOTION_TOKEN || process.env.INPUT_NOTION_TOKEN || "";
  const commitsDb = process.env.NOTION_COMMITS_DB_ID || process.env.INPUT_NOTION_COMMITS_DB_ID || "";
  const tareasDb = process.env.NOTION_TAREAS_DB_ID || process.env.INPUT_NOTION_TAREAS_DB_ID || "";

  const commitMessage = process.env.COMMIT_MESSAGE || "";
  const commitUrl = process.env.COMMIT_URL || "";
  const commitHash = process.env.COMMIT_HASH || "";

  console.log(`Procesando commit: "${commitMessage}"`);

  const COMMITS_DB_ID = commitsDb.replace(/-/g, "").trim();
  const TAREAS_DB_ID = tareasDb.replace(/-/g, "").trim();

  const match = commitMessage.match(/([A-Z]+-\d+)/i);
  if (!match) {
    console.log("⚠️ Omitiendo: No se detectó ningún ID de tarea con formato Prefijo-Número.");
    return;
  }

  const taskId = match[1].toUpperCase();
  const numberId = parseInt(taskId.split('-')[1], 10);
  console.log(`🔍 ID detectado: ${taskId} (Número: ${numberId}). Buscando en la propiedad 'ID'...`);

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
      console.log(`⚠️ Alerta: Notion no encontró ninguna tarea con el número ${numberId} en la propiedad 'ID'.`);
      return;
    }

    const targetPageId = queryResponse.results[0].id;
    console.log(`✅ Tarea localizada con éxito (Page ID: ${targetPageId}). Registrando commit...`);
    
    const shortHash = commitHash ? commitHash.substring(0, 7) : "Commit";

    await notion.pages.create({
      parent: { database_id: COMMITS_DB_ID },
      properties: {
        'Name': { title: [{ text: { content: `[${shortHash}]` } }] },
        'Enlace del Commit': { url: commitUrl },
        'Fecha': { date: { start: new Date().toISOString().split('T')[0] } },
        'Tarea Asociada': { relation: [{ id: targetPageId }] }
      }
    });

    console.log(`✅ ¡Éxito total! Commit [${shortHash}] registrado.`);

  } catch (error) {
    console.error("❌ Error en la comunicación con la API de Notion:", error.message);
    process.exit(1);
  }
}

run();
