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

  // Mantenemos tu patrón estricto (ej: TASK-102)
  const match = commitMessage.match(/([A-Z]+-\d+)/i);
  if (!match) {
    console.log("⚠️ Omitiendo: No se detectó ningún ID de tarea con formato Prefijo-Número en el mensaje del commit.");
    return;
  }

  const taskId = match[1].toUpperCase();
  console.log(`🔍 ID detectado en commit: ${taskId}. Buscando en la base de datos de Notion...`);

  if (!TAREAS_DB_ID || TAREAS_DB_ID.length !== 32) {
    console.error(`❌ Error crítico: El ID de la base de datos de tareas no es válido (Longitud: ${TAREAS_DB_ID.length})`);
    process.exit(1);
  }

  try {
    const notion = new Client({ auth: token });
    let queryResponse = null;
    
    // Extraemos solo la parte numérica (ej: de "TASK-102" saca 102)
    const numberId = parseInt(taskId.split('-')[1], 10);
    console.log(`Filtrando numéricamente por propiedad 'ID' igual a: ${numberId}`);

    // CONSULTA DIRECTA: Usando el filtro numérico estricto que exige la nueva API de Notion
    try {
      queryResponse = await notion.databases.query({
        database_id: TAREAS_DB_ID,
        filter: { 
          property: 'ID', 
          unique_id: { 
            equals: numberId 
          } 
        },
        page_size: 1
      });
    } catch (apiError) {
      console.error("❌ Error de validación al consultar la propiedad 'ID':", apiError.message);
    }

    if (!queryResponse || queryResponse.results.length === 0) {
      console.log(`⚠️ Alerta: Notion no encontró ninguna tarea con el número ${numberId} en la propiedad 'ID'. Revisa si el NOTION_TAREAS_DB_ID de GitHub apunta a la tabla correcta.`);
      return;
    }

    const targetPageId = queryResponse.results[0].id;
    console.log(`✅ Tarea localizada con éxito (Page ID: ${targetPageId}). Generando enlace del commit...`);
    
    const shortHash = commitHash ? commitHash.substring(0, 7) : "Commit";

    // Grabación limpia en tu tabla centralizada de Commits
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
    console.error("❌ Error grave en la comunicación con la API de Notion:", error);
    process.exit(1);
  }
}

run();
