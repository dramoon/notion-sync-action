const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const COMMITS_DB_ID = process.env.NOTION_COMMITS_DB_ID;
const TAREAS_DB_ID = process.env.NOTION_TAREAS_DB_ID; // Nueva DB de tareas

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
  console.log(`ID de tarea detectado: ${taskId}. Buscando en base de datos de Notion...`);

  try {
    // CAMBIO CLAVE: Consultamos directamente la base de datos de tareas filtrando por la propiedad ID
    // Notion obliga a que los filtros de propiedades de tipo ID se busquen por su cadena de texto exacta
    const queryResponse = await notion.databases.query({
      database_id: TAREAS_DB_ID,
      filter: {
        property: 'ID', // <-- Asegúrate de que tu columna de ID numérico en Notion se llama exactamente 'ID'
        id: {
          equals: taskId
        }
      },
      page_size: 1
    });

    if (queryResponse.results.length === 0) {
      console.log(`No se encontró ninguna tarea en la base de datos con el ID exacto: ${taskId}`);
      return;
    }

    const targetPageId = queryResponse.results[0].id;
    console.log(`¡Tarea encontrada! (Page ID: ${targetPageId}). Registrando commit...`);

    // Creamos el commit en la base de datos de mapeo
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
