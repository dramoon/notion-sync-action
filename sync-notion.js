const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Limpiamos los IDs eliminando guiones y espacios por si se colaron al copiarlos
const COMMITS_DB_ID = (process.env.NOTION_COMMITS_DB_ID || "").replace(/-/g, "").trim();
const TAREAS_DB_ID = (process.env.NOTION_TAREAS_DB_ID || "").replace(/-/g, "").trim();

async function run() {
  const commitMessage = process.env.COMMIT_MESSAGE || "";
  const commitUrl = process.env.COMMIT_URL || "";

  console.log(`Procesando commit: "${commitMessage}"`);

  const match = commitMessage.match(/([A-Z]+-\d+)/i);

  if (!match) {
    console.log("No se detectó ningún ID de tarea en el mensaje del commit. Omitiendo.");
    return;
  }

  const taskId = match[1].toUpperCase();
  console.log(`ID de tarea detectado: ${taskId}. Buscando en la base de datos de Notion...`);

  // Validación de seguridad para confirmar que el ID se procesa limpio
  if (!TAREAS_DB_ID || TAREAS_DB_ID.length !== 32) {
    console.error(`Error: El ID de la base de datos de tareas no tiene 32 caracteres válidos. Recibido: "${TAREAS_DB_ID}"`);
    process.exit(1);
  }

  try {
    const queryResponse = await notion.databases.query({
      database_id: TAREAS_DB_ID,
      filter: {
        property: 'ID', // <-- Asegúrate de que la columna con el código numérico en Notion se llame exactamente 'ID'
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
