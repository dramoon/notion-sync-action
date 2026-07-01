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

  const taskId = match[1].toUpperCase(); // Ej: TASK-103
  const numberId = parseInt(taskId.split('-')[1], 10); // Ej: 103
  console.log(`🔍 ID detectado: ${taskId} (Número: ${numberId}). Buscando por escaneo de índice...`);

  try {
    const notion = new Client({ auth: token });
    
    // Traemos las tareas recientes ordenadas por última edición (máximo 100)
    // Esto evita usar el filtro por propiedad 'ID' en el servidor de Notion
    const queryResponse = await notion.databases.query({
      database_id: TAREAS_DB_ID,
      sorts: [
        {
          timestamp: 'last_edited_time',
          direction: 'descending'
        }
      ],
      page_size: 100 
    });

    // Buscamos la tarea en memoria inspeccionando los objetos devueltos
    const targetPage = queryResponse.results.find(page => {
      const idProperty = page.properties['ID'];
      if (idProperty && idProperty.type === 'unique_id') {
        return idProperty.unique_id.number === numberId;
      }
      return false;
    });

    if (!targetPage) {
      console.log(`⚠️ Alerta: No se encontró la tarea con ID numérico ${numberId} entre las 100 tareas más recientes.`);
      return;
    }

    const targetPageId = targetPage.id;
    console.log(`✅ Tarea localizada en memoria (Page ID: ${targetPageId}). Registrando commit...`);
    
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

    console.log(`✅ ¡Éxito total! Commit [${shortHash}] registrado con la nueva estrategia.`);

  } catch (error) {
    console.error("❌ Error grave en la ejecución general:", error);
    process.exit(1);
  }
}

run();
