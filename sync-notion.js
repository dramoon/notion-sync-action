const { Client } = require('@notionhq/client');

// Inicializamos el cliente de Notion con el token secreto
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const COMMITS_DB_ID = process.env.NOTION_COMMITS_DB_ID;

async function run() {
  // Capturamos la información del commit enviada por GitHub Actions
  const commitMessage = process.env.COMMIT_MESSAGE || "";
  const commitUrl = process.env.COMMIT_URL || "";
  const commitAuthor = process.env.COMMIT_AUTHOR || "GitHub Action";

  console.log(`Procesando commit: "${commitMessage}"`);

  // Expresión regular para buscar el patrón TASK-Número (ej: TASK-42)
  // Se adapta automáticamente al prefijo que hayas elegido
  const match = commitMessage.match(/([A-Z]+-\d+)/i);

  if (!match) {
    console.log("No se detectó ningún ID de tarea en el mensaje del commit. Omitiendo.");
    return;
  }

  const taskId = match[1].toUpperCase(); // Asegura que quede en mayúsculas (TASK-42)
  console.log(`ID de tarea detectado: ${taskId}. Buscando en Notion...`);

  try {
    // 1. Buscamos la tarea en tu base de datos de Tareas de Notion usando la propiedad ID
    // Buscamos de manera indirecta en la DB de commits buscando la relación, o directamente mediante búsqueda general
    const searchResponse = await notion.search({
      query: taskId,
      filter: {
        property: 'object',
        value: 'page'
      },
      page_size: 1
    });

    if (searchResponse.results.length === 0) {
      console.log(`No se encontró ninguna tarea en Notion con el ID: ${taskId}`);
      return;
    }

    const targetPageId = searchResponse.results[0].id;
    console.log(`Tarea encontrada en Notion (Page ID: ${targetPageId}). Creando registro de commit...`);

    // 2. Creamos un nuevo elemento en la base de datos de Commits y lo enlazamos
    await notion.pages.create({
      parent: { database_id: COMMITS_DB_ID },
      properties: {
        // Título del elemento de la fila (Mensaje del commit)
        'Name': {
          title: [
            {
              text: { content: commitMessage }
            }
          ]
        },
        // Enlace directo al commit en GitHub
        'Enlace del Commit': {
          url: commitUrl
        },
        // Fecha actual del commit
        'Fecha': {
          date: { start: new Date().toISOString().split('T')[0] }
        },
        // AQUÍ SE HACE LA MAGIA: Vinculamos el commit con la tarea usando la relación
        // Reemplaza 'Tarea Asociada' por el nombre exacto de la columna de relación en tu tabla de commits
        'Tarea Asociada': {
          relation: [
            { id: targetPageId }
          ]
        }
      }
    });

    console.log("¡Commit registrado y enlazado con éxito en Notion!");

  } catch (error) {
    console.error("Error interconectando con la API de Notion:", error);
    process.exit(1);
  }
}

run();