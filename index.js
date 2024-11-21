#!/usr/bin/env node

const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");
const sqlite3 = require("sqlite3").verbose();
const os = require("os");
const fs = require("fs");
const setupDatabase = require("./sqlite/import-data");

const dbPath = "./sqlite/db.sqlite";

const options = yargs(hideBin(process.argv))
  .usage(
    "Usage: node index.js [--models <model1> <model2> ...] --properties <property>"
  )
  .option("models", {
    alias: "m",
    describe: "Model(s) to include",
    type: "array",
  })
  .option("properties", {
    alias: "p",
    type: "array",
    describe: `
      Properties to filter on.
      Assumes no key has ':' or ' ' and no property has ','. Format key:value1,value2
    `,
  })
  .help()
  .alias("help", "h").argv;

const parseValue = (value) => {
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
};

const captureCommand = () => {
  const args = process.argv.slice(2); // Skip the first two elements
  return args.join(" ");
};

const getUsername = () => {
  const osUserInfo = os.userInfo().username;
  const envUsername = process.env.USER || process.env.USERNAME;
  return osUserInfo || envUsername || "unknown user";
};

const logCommand = (db) => {
  const insertQuery = `INSERT INTO log (command, username) VALUES (?, ?)`;
  const command = captureCommand();
  const username = getUsername();

  db.run(insertQuery, [command, username], (err) => {
    if (err) {
      console.error(`Error logging command:`, err.message);
    } else {
      console.log(`Command logged: "${command}" by user "${username}"`);
    }
  });
};

/**
 * Parses an array of property filters and returns a map of property keys to their respective values.
 *
 * @param {string[]} propertyFilters - An array of property filter strings in the format "key:value1,value2,...".
 * @returns {Object} A map where each key is a property name and the value is an array of parsed values.
 *
 * ex:
 * {
 *   "property1": ["value1", "value2"],
 *   "property2": ["value3"],
 * }
 */
function parsePropertyFilters(propertyFilters) {
  const propertyFilterMap = {};
  if (propertyFilters) {
    propertyFilters.forEach((filter) => {
      const [key, values] = filter.split(":");
      if (!key || !values) {
        console.error(`Invalid property filter format: ${filter}`);
        return;
      }
      propertyFilterMap[key] = values.split(",").map(parseValue);
    });
  }
  return propertyFilterMap;
}

// Define boolean columns
const booleanColumns = ["stolen", "impounded"];

/**
 * Retrieves all table names from the SQLite database.
 *
 * @param {sqlite3.Database} db - The SQLite database instance.
 * @returns {Promise<string[]>} - A promise that resolves to an array of table names.
 */
function getAllTableNames(db) {
  return new Promise((resolve, reject) => {
    const query = `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`;
    db.all(query, [], (err, rows) => {
      if (err) {
        return reject(err);
      }
      const tableNames = rows.map((row) => row.name);
      resolve(tableNames);
    });
  });
}

// Check if the database exists and run the import script if necessary
const ensureDatabase = async () => {
  if (!fs.existsSync(dbPath)) {
    console.log("Database not found. Running import script...");
    await setupDatabase();
  } else {
    console.log("Database exists. Skipping import.");
  }
};

/**
 * Queries the database to fetch data based on model and property filters.
 *
 * @param {Array} modelFilters - An array of model names to filter by. If empty, fetch all models.
 * @param {Object} propertyFilterMap - An object where keys are property names and values are arrays of acceptable values.
 * @returns {Promise<Array>} - A promise that resolves to the filtered array of data entities.
 */
async function queryDatabase(modelFilters, propertyFilterMap) {
  await ensureDatabase();

  const db = new sqlite3.Database(dbPath);

  try {
    let tablesToQuery = modelFilters;
    if (!modelFilters || modelFilters.length === 0) {
      tablesToQuery = await getAllTableNames(db);
      if (tablesToQuery.length === 0) {
        throw new Error("No tables found in the database.");
      }
    }

    const queries = [];
    const allResults = [];

    tablesToQuery.forEach((model) => {
      let query = `SELECT * FROM "${model}"`;
      const conditions = [];
      const params = [];

      Object.keys(propertyFilterMap).forEach((key) => {
        const values = propertyFilterMap[key];
        if (values.length > 0) {
          conditions.push(`"${key}" IN (${values.map(() => "?").join(", ")})`);
          params.push(...values);
        }
      });

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      queries.push({ query, params });
    });

    // Execute each query sequentially
    for (const { query, params } of queries) {
      const rows = await new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
      allResults.push(...rows);
    }

    if (allResults.length === 0) {
      console.log("No data found for the specified filters.");
    }

    // Log the command to the database for auditing
    logCommand(db);

    await new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    return allResults;
  } catch (error) {
    await new Promise((resolve) => {
      db.close(() => {
        resolve();
      });
    });
    throw error;
  }
}

/**
 * Aggregates data from an array of flat entities based on their properties.
 *
 * @param {Array} filteredData - The array of entities to aggregate.
 * @returns {Object} An object where each key is a property and the value is an object
 *                   mapping each unique property value to its count.
 */
function aggregateData(filteredData) {
  if (!Array.isArray(filteredData)) {
    throw new TypeError("Expected an array of filtered data");
  }

  const aggregation = {};

  filteredData.forEach((entity) => {
    Object.keys(entity).forEach((key) => {
      let value = entity[key];
      if (value === null || value === undefined) return; // Skip null or undefined values

      // Map 0 and 1 to false and true for boolean columns
      if (booleanColumns.includes(key)) {
        if (value === 1) {
          value = true;
        } else if (value === 0) {
          value = false;
        }
      }

      const valueKey =
        typeof value === "string" ? value : JSON.stringify(value);

      if (!aggregation[key]) {
        aggregation[key] = {};
      }

      aggregation[key][valueKey] = (aggregation[key][valueKey] || 0) + 1;
    });
  });

  return aggregation;
}

/**
 * Formats an aggregation object by sorting the counts in descending order.
 *
 * @param {Object} aggregation - The aggregation object where keys are properties and values are objects with counts.
 * @returns {Object} - A new object with the same keys as the input, but with the counts sorted in descending order.
 */
function formatAggregation(aggregation) {
  const result = {};
  Object.keys(aggregation).forEach((key) => {
    const counts = aggregation[key];
    const sortedAggregations = Object.entries(counts)
      .map(([value, count]) => [value, count]) // Booleans are already mapped
      .sort((a, b) => b[1] - a[1]); // Sort by count descending

    result[key] = sortedAggregations;
  });

  return result;
}

/**
 * Runs the aggregation process.
 *
 * @param {Array} modelFilters - A list of models to filter the aggregation on.
 * @param {Array} propertyFilters - A list of property filters.
 * @returns {Promise<Object>} - The formatted aggregation result.
 */
async function run(modelFilters, propertyFilters) {
  await ensureDatabase();

  const propertyFilterMap = parsePropertyFilters(propertyFilters);
  const filteredData = await queryDatabase(modelFilters, propertyFilterMap);
  if (!Array.isArray(filteredData)) {
    throw new TypeError("Expected an array of filtered data");
  }
  const aggregation = aggregateData(filteredData);
  const formattedAggregation = formatAggregation(aggregation);

  return formattedAggregation;
}

// 🤖
run(options.models, options.properties)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error("Error:", err.message);
  });

module.exports = { run };
