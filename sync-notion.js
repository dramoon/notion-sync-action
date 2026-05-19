const { Client } = require('@notionhq/client');

async function run() {
  // GitHub inyecta los inputs automáticamente como variables de entorno nativas
  // Comprobamos tanto el mapeo directo del action.yml como el prefijo nativo INPUT_
  const token = process.env.NOTION_TOKEN || process.env.INPUT_NOTION_TOKEN || "";
  const commitsDb = process.env.NOTION_COMMITS_DB_ID || process.env.INPUT_NOTION_COMMITS_DB_ID || "";
  const tareasDb = process.env.NOTION_TAREAS_DB_ID || process.env.INPUT_NOTION_TAREAS_DB_ID || "";

  // Capturamos los datos del commit desde las variables del entorno
  const commitMessage = process.env.COMMIT_MESSAGE || "";
  const commitUrl = process.env.COMMIT_URL || "";

  console.log(`Procesando commit: "${commitMessage}"`);

  // Sanitizamos las bases de datos quitando guiones y espacios
  const COMMITS_DB_ID = commitsDb.replace(/-/g, "").trim();
  const TAREAS_DB_ID = tareasDb.replace(/-/g, "").trim();

  // --- BLOQUE DE DIAGNÓSTICO ---
  console.log("--- AUDITORÍA DIRECTA DE ENTORNO ---");
  console.log(`¿Token recibido?: ${token ? "SÍ" : "NO"}`);
  console.log(`¿Formato moderno (ntn_)?: ${token.startsWith('ntn_') ? "SÍ" : "NO"}`);
  console.log(`Longitud limpia Commits DB: ${COMMITS_DB_ID.length}`);
  console.log(`Longitud limpia Tareas DB: ${TAREAS_DB_ID.length}`);
  console.log("------------------------------------");

  // Extraemos el patrón TASK-15 (o cualquier combinación de letras-números)
  const match = commitMessage.match(/([A-Z]+-\d+)/i);
  if (!match) {
    console.log("No se detectó ningún ID de tarea en el mensaje del commit. Omitiendo.");
    return;
  }

  const taskId = match[1].toUpperCase();
  console.log(`ID de tarea detectado: ${taskId}. Buscando en la base de datos de Notion...`);

  // Validación de seguridad para evitar llamadas vacías a la API
  if (!TAREAS_DB_ID || TAREAS_DB_ID.length !== 32) {
    console.error(`Error crítico: El ID de la base de datos de tareas no es válido (Longitud: ${TAREAS_DB_ID.length})`);
    process.exit(1);
  }

  try {
    const notion = new Client({ auth: token });
    let queryResponse = null;
    
    // ESTRATEGIA 1: Asumir que la columna 'ID' es de tipo "ID Único" (Autonumérico nativo de Notion)
    try {
      const numberId = parseInt(taskId.split('-')[1], 10);
      console.log(`Intentando buscar en columna 'ID' como Unique ID numérico: ${numberId}...`);
      queryResponse = await notion.databases.query({
        database_id: TAREAS_DB_ID,
        filter: {
          property: 'ID',
          unique_id: { equals: numberId }
        },
        page_size: 1
      });
    } catch (e) {
      console.log("La columna 'ID' no admite filtro 'unique_id' o falló el formato. Pivotando...");
    }

    // ESTRATEGIA 2: Si la anterior falló o no dio resultados, probar como Texto Normal (Rich Text)
    if (!queryResponse || queryResponse.results.length === 0) {
      try {
        console.log(`Intentando buscar en columna 'ID' como campo de Texto (rich_text): "${taskId}"...`);
        queryResponse = await notion.databases.query({
          database_id: TAREAS_DB_ID,
          filter: {
            property: 'ID',
            rich_text: { equals: taskId }
          },
          page_size: 1
        });
      } catch (e) {
        console.log("La columna 'ID' no admite filtro 'rich_text'. Pivotando...");
      }
    }

    // ESTRATEGIA 3: Por si acaso la columna 'ID' es la columna principal de la tabla (tipo Título)
    if (!queryResponse || queryResponse.results.length === 0) {
      try {
        console.log(`Intentando buscar en columna 'ID' como campo de Título (title): "${taskId}"...`);
        queryResponse = await notion.databases.query({
          database_id: TAREAS_DB_ID,
          filter: {
            property: 'ID',
            title: { equals: taskId }
          },
          page_size: 1
        });
      } catch (e) {
        console.log("La columna 'ID' no admite filtro 'title'.");
      }
    }

    // Validación final de resultados de búsqueda
    if (!queryResponse || queryResponse.results.length === 0) {
      console.log(`No se encontró ninguna tarea en Notion que coincida con: ${taskId}. Revisa que la columna de códigos se llame exactamente 'ID'.`);
      return;
    }

    const targetPageId = queryResponse.results[0].id;
    console.log(`¡Tarea encontrada con éxito! (Page ID: ${targetPageId}). Registrando commit...`);

    // Inserción del registro en la tabla de Historial de Commits
    await notion.pages.create({
      parent: { database_id: COMMITS_DB_ID },
      properties: {
        'Name': { title: [{ text: { content: `[${shortHash}]` } }] }, // <-- Ahora guardará "[a1b2c3d]"
        'Enlace del Commit': { url: commitUrl },
        'Fecha': { date: { start: new Date().toISOString().split('T')[0] } },
        'Tarea Asociada': { relation: [{ id: targetPageId }] }
      }
    });

    console.log("¡Commit registrado y enlazado con éxito en Notion!");

  } catch (error) {
    console.error("Error definitivo interconectando con la API de Notion:", error);
    process.exit(1);
  }
}

run();
