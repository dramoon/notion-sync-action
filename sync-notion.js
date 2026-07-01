const { Client } = require('@notionhq/client');

// Función auxiliar para pausar la ejecución (milisegundos)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    
    const numberId = parseInt(taskId.split('-')[1], 10);
    console.log(`Filtrando numéricamente por propiedad 'ID' igual a: ${numberId}`);

    // Bucle de reintentos (Máximo 3 intentos ante fallos de conexión / Premature Close)
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
        
        // Si la petición tuvo éxito y devolvió datos, rompemos el bucle de reintentos
        if (queryResponse) break;

      } catch (apiError) {
        console.warn(`⚠️ Intento ${attempt} fallido debido a un problema de red: ${apiError.message}`);
        if (attempt === maxRetries) {
          console.error("❌ Se alcanzaron todos los reintentos permitidos sin éxito.");
        } else {
          console.log("Reintentando en 2 segundos...");
          await delay(2000);
        }
      }
    }

    if (!queryResponse || queryResponse.results.length === 0) {
      console.log(`⚠️ Alerta: Notion no encontró ninguna tarea con el número ${numberId} en la propiedad 'ID'.`);
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
    console.error("❌ Error grave en la ejecución general del script:", error);
    process.exit(1);
  }
}

run();
