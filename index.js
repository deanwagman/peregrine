#!/usr/bin/env node

const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("fs");

const options = yargs(hideBin(process.argv))
  .usage("Usage: yarn filter -m <model> -p <property>")
  .option("input", {
    alias: "i",
    describe: "The data file to be processed",
    type: "string",
    default: "entities.json",
  })
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
  }).argv;

const parseValue = (value) => {
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
};

const data = JSON.parse(fs.readFileSync(options.input, "utf8"));

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

/**
 * Filters an array of data entities based on model and property filters.
 *
 * @param {Array} data - The array of data entities to filter.
 * @param {Array} modelFilters - An array of model names to filter by. If null or empty, all models are included.
 * @param {Object} propertyFilterMap - An object where keys are property slugs and values are arrays of acceptable values for those properties.
 * @returns {Array} - The filtered array of data entities.
 *
 * ex:
 * [
 *   {
 *     "model": "model1",
 *     "properties": [
 *       {
 *          "slug": "property1",
 *          "value": "value1"
 *       },
 *       {
 *          "slug": "property2",
 *          "value": "value3"
 *       }
 *    ]
 *  },
 * ...
 * ]
 */
function filterData(data, modelFilters, propertyFilterMap) {
  return data.filter((entity) => {
    // Model filter (union)
    const modelMatch =
      !modelFilters ||
      modelFilters.length === 0 ||
      modelFilters.includes(entity.model);

    // Property filters (intersect of keys, union of values)
    const propertyMatch = Object.keys(propertyFilterMap).every((key) => {
      const acceptableValues = propertyFilterMap[key];
      const prop = entity.properties.find((p) => p.slug === key);

      if (!prop || prop.value === null) return false;

      return acceptableValues.includes(prop.value);
    });

    return modelMatch && propertyMatch;
  });
}

/**
 * Aggregates data from an array of entities based on their properties.
 *
 * @param {Array} filteredData - The array of entities to aggregate. Each entity should have a `properties` array.
 * @param {Array} filteredData[].properties - The properties of each entity.
 * @param {Object} filteredData[].properties[].slug - The slug of the property.
 * @param {any} filteredData[].properties[].value - The value of the property.
 * @returns {Object} An object where each key is a property slug and the value is an object
 *                   mapping each unique property value to its count.
 * {
 *   "property1": {
 *     "value1": 2,
 *     "value2": 1,
 *   },
 *   "property2": {
 *     "value3": 3,
 *     "value4": 1,
 *   },
 * }
 */
function aggregateData(filteredData) {
  const aggregation = {};
  filteredData.forEach((entity) => {
    entity.properties.forEach((prop) => {
      const slug = prop.slug;
      const value = prop.value;
      if (value === null) return; // Skip null values

      if (!aggregation[slug]) {
        aggregation[slug] = {};
      }

      const valueKey =
        typeof value === "string" ? value : JSON.stringify(value);

      aggregation[slug][valueKey] = (aggregation[slug][valueKey] || 0) + 1;
    });
  });

  return aggregation;
}

/**
 * Formats an aggregation object by sorting the counts in descending order.
 *
 * @param {Object} aggregation - The aggregation object where keys are slugs and values are objects with counts.
 * @returns {Object} - A new object with the same keys as the input, but with the counts sorted in descending order.
 *
 * ex:
 *  {
 *    "property1": [
 *      ["value1", 2],
 *      ["value2", 1],
 *    ],
 *    "property2": [
 *      ["value3", 3],
 *      ["value4", 1],
 *    ],
 *  }
 */
function formatAggregation(aggregation) {
  const result = {};
  Object.keys(aggregation).forEach((slug) => {
    const counts = aggregation[slug];
    const sortedAggregations = Object.entries(counts)
      .map(([value, count]) => [parseValue(value), count])
      .sort((a, b) => b[1] - a[1]); // Sort by count descending

    result[slug] = sortedAggregations;
  });

  return result;
}

/**
 * Takes a list of entity objects, filters data matching the `models` and `properties` specifications,
 * and then aggregates the data returning a sorted list of aggregations.
 *
 * @param data - The list entity data
 * @param modelFilters - A list of models to filter the aggregation on
 * @param propertyFilters - A list of property keys and values to filter the aggregation on. Format: key:value1,value2
 *
 * @returns A dictionary of property slugs to a sorted list of aggregations
 */
function run(data, modelFilters, propertyFilters) {
  const propertyFilterMap = parsePropertyFilters(propertyFilters);
  const filteredData = filterData(data, modelFilters, propertyFilterMap);
  const aggregation = aggregateData(filteredData);
  const formattedAggregation = formatAggregation(aggregation);

  return formattedAggregation;
}

// 🤖
console.log(run(data, options.models, options.properties));
