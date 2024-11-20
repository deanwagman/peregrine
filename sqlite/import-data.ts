const sqlite3 = require('sqlite3');
const data = require('../entities.json');

const basicSanitization = (str) => str.replace(/[^a-zA-Z0-9_]/g, '');

// Open the database
const db = new sqlite3.Database('./sqlite/db.sqlite');

const importData = (data) => {
    data.forEach(entity => {
        const tableName = `"${basicSanitization(entity.model)}"`;
        const columns = entity.properties.map(prop => {
            const columnName = `${basicSanitization(prop.slug)}`;
            const columnType = basicSanitization(prop.type.toUpperCase());
            return `${columnName} ${columnType}`;
        }).join(', ');

        // Create table
        const createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns})`;
        db.run(createTableQuery, (err) => {
            if (err) {
                return console.error(err.message);
            }
            console.log(`Table ${tableName} created or already exists.`);
        });

        // Insert data
        const columnNames = entity.properties.map(prop => `"${basicSanitization(prop.slug)}"`).join(', ');
        const placeholders = entity.properties.map(() => '?').join(', ');
        const values = entity.properties.map(prop => prop.value);

        const insertQuery = `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`;

        console.log(insertQuery, values);
        db.run(insertQuery, values, (err) => {
            if (err) {
                return console.error(err.message);
            }
            console.log(`Data inserted into table ${tableName}.`);
        });
    });
};

importData(data);

// Close the database connection
db.close();