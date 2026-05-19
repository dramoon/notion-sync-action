const { Client } = require('@notionhq/client');
const core = require('@actions/core'); 

async function run() {
  // Capturamos los datos desde los inputs de GitHub
  const token = core.getInput('notion_token') || process.env.NOTION_TOKEN || "";
  const commitsDb = core.getInput('notion_commits_db_id') || process.env.NOTION_COMMITS_DB_ID || "";
  const tareasDb = core.getInput('notion_tareas_db_id') || process.env.NOTION_TAREAS_DB_ID || "";

  // Capturamos los datos del commit directamente de las variables de entorno nativas de GitHub
  const commitMessage = process.env.COMMIT_MESSAGE || "";
  const commitUrl = process.env.COMMIT_URL || "";

  console.log(`Procesando commit: "${commitMessage}"`);

  // Sanitizamos los IDs eliminando guiones y espacios
  const COMMITS_DB_ID = commitsDb.replace(/-/g, "").trim();
  const TAREAS_DB_ID = tareasDb.replace(/-/g, "").trim();

  // --- BLOQUE DE DIAGNÓSTICO INTEGRADO ---
  console.log("--- AUDITORÍA DIRECTA DE INPUTS ---");
  console.log(`¿Token recibido?: ${token ? "SÍ" : "NO"}`);
  console.log(`¿Formato moderno de Notion (ntn_)?: ${token.startsWith('ntn_') ? "SÍ" : "NO"}`);
  console.log(`Longitud limpia Commits DB: ${COMMITS_DB_ID.length}`);
  console.log(`Longitud limpia Tareas DB: ${TAREAS_DB_ID.length}`);
  console.log("-----------------------------------");

  const match = commitMessage.match(/([A-Z]+-\d+)/i);
  if (!match) {
    console.log("No se detectó ningún ID de tarea en el mensaje del commit. Omitiendo.");
    return;
  }

  const taskId = match[1].toUpperCase();
  console.log(`ID de tarea detectado: ${taskId}. Buscando en la base de datos de Notion...`);

  // Validación de longitud de los IDs (deben tener 32 caracteres)
  if (!TAREAS_DB_ID || TAREAS_DB_ID.length !== 32) {
    console.error(`Error crítico: El ID de la base de datos de tareas no es válido (Longitud: ${TAREAS_DB_ID.length})`);
    process.exit(1);
  }

  try {
    const notion = new Client({ auth: token });
    
    const queryResponse = await notion.databases.query({
      database_id: TAREAS_DB_ID,
      filter: {
        property: 'ID', // <-- Asegúrate de que tu columna en Notion se llama exactamente 'ID'
        id: { equals: taskId }
      },
      page_size: 1
    });

    if (queryResponse.results.length === 0) {
      console.log(`No se encontró ninguna tarea en Notion con el ID exacto: ${taskId}`);
      return;
    }

    const targetPageId = queryResponse.results[0].id;
    console.log(`¡Tarea encontrada con éxito! (Page ID: ${targetPageId}). Registrando commit...`);

    // Creamos el registro en la tabla de commits
    await notion.pages.create({
      parent: { database_id: COMMITS_DB_ID },
      properties: {
        'Name': { title: [{ text: { content: commitMessage } }] },
        'Enlace del Commit': { url: commitUrl },
        'Fecha': { date: { start: new Date().toISOString().split('T')[0] } },
        'Tarea Asociada': { relation: [{ id: targetPageId }] }
      }
    });

    console.log("¡Commit registrado y enlazado con éxito en Notion!");

  } catch (error) {
    console.error("Error interconectando con la API de Notion:", error);
    process.exit(1);
  }
}

run();
