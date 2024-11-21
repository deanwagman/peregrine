const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const data = require("../data/entities.json");

const basicSanitization = (str) => str.replace(/[^a-zA-Z0-9_]/g, "");

const runQuery = (db, query, params = []) =>
  new Promise((resolve, reject) => {
    db.run(query, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

const importData = async (db, data) => {
  for (const entity of data) {
    const tableName = `"${basicSanitization(entity.model)}"`;
    const columns = entity.properties
      .map((prop) => {
        const columnName = `${basicSanitization(prop.slug)}`;
        const columnType =
          {
            STRING: "TEXT",
            INTEGER: "INTEGER",
            BOOLEAN: "INTEGER",
          }[prop.type.toUpperCase()] || "TEXT";
        return `${columnName} ${columnType}`;
      })
      .join(", ");

    const createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns})`;
    await runQuery(db, createTableQuery);
    console.log(`Table ${tableName} created or already exists.`);

    const columnNames = entity.properties
      .map((prop) => `"${basicSanitization(prop.slug)}"`)
      .join(", ");
    const placeholders = entity.properties.map(() => "?").join(", ");
    const values = entity.properties.map((prop) => prop.value);

    const insertQuery = `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`;
    await runQuery(db, insertQuery, values);
    console.log(`Data inserted into table ${tableName}.`);
  }
};

const updateImportTable = async (db) => {
  const createTableQuery = `CREATE TABLE IF NOT EXISTS "import" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`;
  await runQuery(db, createTableQuery);
  console.log(`Table "import" created or already exists.`);

  const insertQuery = `INSERT INTO "import" (imported_at) VALUES (CURRENT_TIMESTAMP)`;
  await runQuery(db, insertQuery);
  console.log(`Data inserted into table "import".`);
};

const createLogTableQuery = async (db) => {
  const createTableQuery = `CREATE TABLE IF NOT EXISTS "log" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          command TEXT,
          accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          username TEXT
      )`;
  await runQuery(db, createTableQuery);
  console.log(`Table "log" created or already exists.`);
};

const setupDatabase = async () => {
  const dbPath = path.resolve(__dirname, "./db.sqlite");
  if (!fs.existsSync(dbPath)) {
    console.log("Database not found. Initializing...");
    console.log(`Resolved database path: ${dbPath}`);
    const db = new sqlite3.Database(dbPath);

    try {
      await importData(db, data);
      await updateImportTable(db);
      await createLogTableQuery(db);
      console.log("Database setup complete.");
    } catch (err) {
      console.error("Error during database setup:", err.message);
    } finally {
      db.close((err) => {
        if (err) {
          console.error("Error closing database:", err.message);
        } else {
          console.log("Database connection closed.");
        }
      });
    }
  } else {
    console.log("Database already exists. Skipping setup.");
  }
};

module.exports = setupDatabase;
