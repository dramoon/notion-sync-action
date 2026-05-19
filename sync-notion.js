const { Client } = require('@notionhq/client');

// Inicializamos el cliente oficial de Notion
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const COMMITS_DB_ID = process.env.NOTION_COMMITS_DB_ID;
const TAREAS_DB_ID = process.env.NOTION_TAREAS_DB_ID;

async function run() {
  const commitMessage = process.env.COMMIT_MESSAGE || "";
  const commitUrl = process.env.COMMIT_URL || "";

  console.log(`Procesando commit: "${commitMessage}"`);

  // Capturamos el patrón TASK-XX
  const match = commitMessage.match(/([A-Z]+-\d+)/i);

  if (!match) {
    console.log("No se detectó ningún ID de tarea en el mensaje del commit. Omitiendo.");
    return;
  }

  const taskId = match[1].toUpperCase();
  console.log(`ID de tarea detectado: ${taskId}. Buscando en la base de datos de Notion...`);

  try {
    // Hacemos la consulta usando la sintaxis exacta del SDK oficial: databases.query
    const queryResponse = await notion.databases.query({
      database_id: TAREAS_DB_ID,
      filter: {
        property: 'ID', // <-- Tu columna de ID en Notion debe llamarse exactamente 'ID'
        id: {
          equals: taskId
        }
      },
      page_size: 1
    });

    if (queryResponse.results.length === 0) {
      console.log(`No se encontró ninguna tarea en Notion con el ID exacto: ${taskId}`);
      return;
    }

    const targetPageId = queryResponse.results[0].id;
    console.log(`¡Tarea encontrada con éxito! (Page ID: ${targetPageId}). Registrando commit...`);

    // Creamos la nueva fila en tu tabla de Mapeo de Commits
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
