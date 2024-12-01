const AWS = require("aws-sdk");
const semver = require("semver"); // For handling version ranges
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const queries = Array.isArray(event.body)
      ? JSON.parse(event.body) // If input is an array, parse it as-is
      : [JSON.parse(event.body)]; // Wrap a single object in an array

    if (queries.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Request must include at least one query" }),
      };
    }

    const tableName = "Packages";
    let results = [];
    let seenPackages = new Set(); // To track unique packages

    for (const query of queries) {
      const { Name, Version } = query;

      if (!Name) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Each query must include a 'Name'" }),
        };
      }

      let filterExpression = "Name = :name";
      let expressionAttributeValues = { ":name": Name };

      if (Version) {
        const versionRange = getVersionRange(Version);
        filterExpression += " AND Version BETWEEN :minVersion AND :maxVersion";
        expressionAttributeValues[":minVersion"] = versionRange.min;
        expressionAttributeValues[":maxVersion"] = versionRange.max;
      }

      // Query DynamoDB
      const params = {
        TableName: tableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
      };

      const response = await dynamoDB.scan(params).promise();

      // Collect unique packages
      for (const item of response.Items) {
        const packageKey = `${item.Name}-${item.Version}`;
        if (!seenPackages.has(packageKey)) {
          seenPackages.add(packageKey);
          results.push({
            Version: item.Version,
            Name: item.Name,
            ID: item.PackageID,
          });
        }
      }
    }

    // Return the aggregated unique results
    return {
      statusCode: 200,
      body: JSON.stringify(results),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

// Helper function to parse version ranges
function getVersionRange(version) {
  if (semver.valid(version)) {
    // Exact version
    return { min: version, max: version };
  } else if (semver.validRange(version)) {
    const range = semver.minVersion(version);
    const max = semver.valid(semver.inc(range, "major")) || semver.inc(range, "minor");
    return { min: range, max };
  } else if (version.includes("-")) {
    const [min, max] = version.split("-");
    return { min, max };
  } else {
    throw new Error(`Invalid version range: ${version}`);
  }
}
