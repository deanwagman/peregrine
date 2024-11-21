const sqlite3 = require('sqlite3').verbose();
const { run } = require('../index');

describe("SQLite Integration Tests", () => {
  let db;

  beforeAll((done) => {
    // Initialize SQLite database
    db = new sqlite3.Database('./sqlite/db.sqlite', (err) => {
      if (err) {
        console.error("Failed to connect to the SQLite database:", err);
        return done(err);
      }
      done();
    });
  });

  afterAll((done) => {
    // Close SQLite database
    db.close((err) => {
      if (err) {
        console.error("Failed to close the SQLite database:", err);
        return done(err);
      }
      done();
    });
  });

  test("should filter data by model and aggregate correctly", async () => {
    const models = ["person"];
    const properties = [];

    const result = await run(models, properties);

    expect(result).toHaveProperty("first_name");
    expect(result["first_name"]).toBeInstanceOf(Array);
    expect(result["first_name"].length).toBeGreaterThan(0);

    const firstNameAggregation = result["first_name"];
    expect(firstNameAggregation).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([expect.any(String), expect.any(Number)]),
      ])
    );
  });

  test("should filter data by property and aggregate correctly", async () => {
    const models = [];
    const properties = ["hair_color:brown"];

    const result = await run(models, properties);

    expect(result).toHaveProperty("hair_color");
    expect(result["hair_color"]).toBeInstanceOf(Array);

    const hairColorAggregation = result["hair_color"];
    expect(hairColorAggregation).toContainEqual(["brown", expect.any(Number)]);
  });

  test("should filter data by model and property and return correct aggregation", async () => {
    const models = ["vehicle"];
    const properties = ["make:toyota", "stolen:1"];
  
    const result = await run(models, properties);
  
    expect(result).toHaveProperty("make");
    expect(result["make"]).toBeInstanceOf(Array);
    expect(result["make"]).toContainEqual(["toyota", expect.any(Number)]);
  
    expect(result).toHaveProperty("stolen");

    // Check for "true" because the value is mapped to a boolean in the aggregation from 0 and 1
    expect(result["stolen"]).toContainEqual(["true", expect.any(Number)]); 
  });  

  test("should return an empty result for non-matching filters", async () => {
    const models = ["person"];
    const properties = ["eye_color:purple"];

    const result = await run(models, properties);

    expect(result).toEqual({});
  });

  test("should handle multiple property values and return union of matches", async () => {
    const models = ["case"];
    const properties = ["status:closed,referred to da"];

    const result = await run(models, properties);

    expect(result).toHaveProperty("status");
    const statusAggregation = result["status"];
    expect(statusAggregation).toEqual(
      expect.arrayContaining([
        ["closed", expect.any(Number)],
        ["referred to da", expect.any(Number)],
      ])
    );
  });
});
