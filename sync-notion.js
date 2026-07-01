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
    console.log("⚠️ Omitiendo: No se detectó ningún ID de tarea con formato Prefijo-Número.");
    return;
  }

  const taskId = match[1].toUpperCase(); 
  const numberId = parseInt(taskId.split('-')[1], 10); 
  console.log(`🔍 Buscando de forma optimizada la tarea: ${taskId} (Número: ${numberId})...`);

  try {
    const notion = new Client({ auth: token });
    
    // Filtro ligero: Traemos solo tareas activas ("En progreso" o "Sin empezar")
    // Evitamos por completo usar el filtro por la propiedad numérica 'ID' que hace crashear a Notion
    const queryResponse = await notion.databases.query({
      database_id: TAREAS_DB_ID,
      filter: {
        or: [
          {
            property: 'Estado',
            status: {
              equals: 'En progreso'
            }
          },
          {
            property: 'Estado',
            status: {
              equals: 'Sin empezar'
            }
          }
        ]
      },
      page_size: 100 
    });

    let results = queryResponse.results;
    
    // Buscador matemático en memoria local de Node.js
    const encontrarTarea = (lista) => lista.find(page => {
      const idProp = page.properties['ID'];
      return idProp && idProp.type === 'unique_id' && idProp.unique_id.number === numberId;
    });

    let targetPage = encontrarTarea(results);

    // Salvavidas de emergencia: si la tarea no está en esos estados (ej. ya se marcó como completada antes),
    // escaneamos rápidamente las últimas 30 tareas modificadas recientemente sin importar su estado.
    if (!targetPage) {
      console.log("No encontrada entre las tareas activas. Escaneando el histórico reciente por si acaso...");
      const backupResponse = await notion.databases.query({
        database_id: TAREAS_DB_ID,
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
        page_size: 30
      });
      targetPage = encontrarTarea(backupResponse.results);
    }

    if (!targetPage) {
      console.log(`⚠️ Alerta: No se encontró la tarea con el número ${numberId} en la propiedad 'ID' tras el escaneo optimizado.`);
      return;
    }

    const targetPageId = targetPage.id;
    console.log(`✅ Tarea localizada en memoria (Page ID: ${targetPageId}). Registrando commit...`);
    
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

    console.log(`✅ ¡Éxito total! Commit [${shortHash}] registrado correctamente.`);

  } catch (error) {
    console.error("❌ Error crítico en la ejecución:", error.message);
    process.exit(1);
  }
}

run();
