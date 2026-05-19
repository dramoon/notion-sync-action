const { Client } = require('@notionhq/client');

async function run() {
  // GitHub inyecta los inputs de la acción automáticamente como variables de entorno
  // con el prefijo 'INPUT_' seguido del nombre en MAYÚSCULAS.
  const token = process.env.INPUT_NOTION_TOKEN || process.env.NOTION_TOKEN || "";
  const commitsDb = process.env.INPUT_NOTION_COMMITS_DB_ID || process.env.NOTION_COMMITS_DB_ID || "";
  const tareasDb = process.env.INPUT_NOTION_TAREAS_DB_ID || process.env.NOTION_TAREAS_DB_ID || "";

  // Capturamos el mensaje del commit directamente de las variables globales de GitHub
  const commitMessage = process.env.COMMIT_MESSAGE || "";
  const commitUrl = process.env.COMMIT_URL || "";

  console.log(`Procesando commit: "${commitMessage}"`);

  // Sanitizamos los IDs eliminando guiones y espacios
  const COMMITS_DB_ID = commitsDb.replace(/-/g, "").trim();
  const TAREAS_DB_ID = tareasDb.replace(/-/g, "").trim();

  // --- BLOQUE DE DIAGNÓSTICO ---
  console.log("--- AUDITORÍA DIRECTA DE ENTORNO ---");
  console.log(`¿Token recibido?: ${token ? "SÍ" : "NO"}`);
  console.log(`¿Formato moderno (ntn_)?: ${token.startsWith('ntn_') ? "SÍ" : "NO"}`);
  console.log(`Longitud limpia Commits DB: ${COMMITS_DB_ID.length}`);
  console.log(`Longitud limpia Tareas DB: ${TAREAS_DB_ID.length}`);
  console.log("------------------------------------");

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
    
    const queryResponse = await notion.databases.query({
      database_id: TAREAS_DB_ID,
      filter: {
        property: 'ID', // <-- Tu columna en Notion con el código (TASK-15) debe llamarse exactamente 'ID'
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

    // Creamos la nueva página en la tabla de Mapeo de Commits
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
