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
    console.log("No se detectó ningún ID de tarea en el mensaje del commit. Omitiendo.");
    return;
  }

  const taskId = match[1].toUpperCase();
  console.log(`ID de tarea detectado: ${taskId}. Buscando en la base de datos de Notion...`);

  if (!TAREAS_DB_ID || TAREAS_DB_ID.length !== 32) {
    console.error(`Error crítico: El ID de la base de datos de tareas no es válido (Longitud: ${TAREAS_DB_ID.length})`);
    process.exit(1);
  }

  try {
    const notion = new Client({ auth: token });
    let queryResponse = null;
    
    // ESTRATEGIA 1: Texto Exacto (Evita colisiones validando el prefijo completo: EF-11 vs TASK-11)
    try {
      queryResponse = await notion.databases.query({
        database_id: TAREAS_DB_ID,
        filter: { property: 'ID', rich_text: { equals: taskId } },
        page_size: 1
      });
    } catch (e) {}

    // ESTRATEGIA 2: Título Principal (Como alternativa si se guarda de forma diferente)
    if (!queryResponse || queryResponse.results.length === 0) {
      try {
        queryResponse = await notion.databases.query({
          database_id: TAREAS_DB_ID,
          filter: { property: 'ID', title: { equals: taskId } },
          page_size: 1
        });
      } catch (e) {}
    }

    // ESTRATEGIA 3: ID Único numérico puro (Último recurso si las anteriores fallan)
    if (!queryResponse || queryResponse.results.length === 0) {
      try {
        const numberId = parseInt(taskId.split('-')[1], 10);
        queryResponse = await notion.databases.query({
          database_id: TAREAS_DB_ID,
          filter: { property: 'ID', unique_id: { equals: numberId } },
          page_size: 1
        });
      } catch (e) {}
    }

    if (!queryResponse || queryResponse.results.length === 0) {
      console.log(`No se encontró la tarea: ${taskId}`);
      return;
    }

    const targetPageId = queryResponse.results[0].id;
    
    // Obtenemos el hash corto (7 caracteres, ej: "7b1a2c3")
    const shortHash = commitHash ? commitHash.substring(0, 7) : "Commit";

    // Creamos la fila en tu única tabla centralizada de Commits
    await notion.pages.create({
      parent: { database_id: COMMITS_DB_ID },
      properties: {
        'Name': { title: [{ text: { content: `[${shortHash}]` } }] }, // Titulo limpio
        'Enlace del Commit': { url: commitUrl },
        'Fecha': { date: { start: new Date().toISOString().split('T')[0] } },
        'Tarea Asociada': { relation: [{ id: targetPageId }] }
      }
    });

    console.log(`¡Commit [${shortHash}] registrado y enlazado con éxito en la tabla central!`);

  } catch (error) {
    console.error("Error interconectando con la API de Notion:", error);
    process.exit(1);
  }
}

run();
