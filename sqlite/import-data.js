const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const data = require("../data/entities.json");

const basicSanitization = (str) => str.replace(/[^a-zA-Z0-9_]/g, "");

/**
 * Executes a SQL query on the provided database.
 *
 * @param {Object} db - The SQLite database instance.
 * @param {string} query - The SQL query to be executed.
 * @param {Array} [params=[]] - Optional array of parameters to be used in the SQL query.
 * @returns {Promise<void>} A promise that resolves when the query is successfully executed, or rejects with an error.
 */
const runQuery = (db, query, params = []) =>
  new Promise((resolve, reject) => {
    db.run(query, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

/**
 * Imports data into an SQLite database.
 *
 * @param {Object} db - The SQLite database connection object.
 * @param {Array} data - An array of entities to be imported. Each entity should have a `model` property representing the table name and a `properties` array containing objects with `slug`, `type`, and `value` properties.
 * @returns {Promise<void>} - A promise that resolves when the data has been successfully imported.
 *
 * @example
 * const db = await openDatabaseConnection();
 * const data = [
 *     {
 *         "model": "vehicle",
 *         "properties": [
 *             {
 *                 "slug": "make",
 *                 "type": "string",
 *                 "value": "chevrolet"
 *             },
 *             {
 *                 "slug": "stolen",
 *                 "type": "boolean",
 *                 "value": true
 *             },
 *             {
 *                 "slug": "impounded",
 *                 "type": "boolean",
 *                 "value": false
 *             },
 *             {
 *                 "slug": "year",
 *                 "type": "integer",
 *                 "value": 1982
 *             }
 *         ]
 *     },
 * ];
 * await importData(db, data);
 *
 * The table has the following columns:
 * - id: INTEGER PRIMARY KEY AUTOINCREMENT
 * - command: TEXT
 * - accessed_at: DATETIME with default value of CURRENT_TIMESTAMP
 * - username: TEXT
 *
 * @param {Object} db - The database connection object.
 * @returns {Promise<void>} A promise that resolves when the table is created or already exists.
 */
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

/**
 * Sets up the database by initializing it if it does not exist, importing data,
 * updating the import table, and creating a log table. If the database already
 * exists, the setup is skipped.
 *
 * @async
 * @function setupDatabase
 * @returns {Promise<void>} A promise that resolves when the database setup is complete.
 * @throws {Error} Throws an error if there is an issue during the database setup.
 */
const setupDatabase = async () => {
  const dbPath = path.resolve(__dirname, "./db.sqlite");
  if (!fs.existsSync(dbPath)) {
    console.log("Database not found. Initializing...");
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
