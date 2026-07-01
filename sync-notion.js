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
    console.log("⚠️ Omitiendo: No se detectó ningún ID de tarea.");
    return;
  }

  const taskId = match[1].toUpperCase(); // Ej: TASK-103
  console.log(`🔍 Atacando vía Búsqueda Global para: ${taskId}...`);

  try {
    const notion = new Client({ auth: token });
    
    // Usamos el buscador global de Notion (esquiva por completo el endpoint de base de datos corrupto)
    const searchResponse = await notion.search({
      query: taskId,
      filter: {
        property: 'object',
        value: 'page'
      },
      page_size: 5
    });

    // Filtramos en memoria que la página encontrada pertenezca realmente a tu base de datos de tareas
    const targetPage = searchResponse.results.find(page => {
      return page.parent && 
             page.parent.type === 'database_id' && 
             page.parent.database_id.replace(/-/g, "") === TAREAS_DB_ID;
    });

    if (!targetPage) {
      console.log(`⚠️ Alerta: El buscador global no indexó ninguna página con el texto "${taskId}" en tu base de datos.`);
      return;
    }

    const targetPageId = targetPage.id;
    console.log(`✅ ¡Localizada por buscador! (Page ID: ${targetPageId}). Registrando commit...`);
    
    const shortHash = commitHash ? commitHash.substring(0, 7) : "Commit";

    // Grabación limpia en la tabla de Commits
    await notion.pages.create({
      parent: { database_id: COMMITS_DB_ID },
      properties: {
        'Name': { title: [{ text: { content: `[${shortHash}]` } }] },
        'Enlace del Commit': { url: commitUrl },
        'Fecha': { date: { start: new Date().toISOString().split('T')[0] } },
        'Tarea Asociada': { relation: [{ id: targetPageId }] }
      }
    });

    console.log(`✅ ¡Éxito total! Commit [${shortHash}] registrado con el buscador global.`);

  } catch (error) {
    console.error("❌ Error crítico en la ejecución:", error.message);
    process.exit(1);
  }
}

run();
