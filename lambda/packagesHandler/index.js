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
    let lastEvaluatedKey = null; // For pagination
    let paginationOffset = null;

    for (const query of queries) {
      const { Name, Version, Offset } = query;

      if (!Name) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Each query must include a 'Name'" }),
        };
      }

      let params = { TableName: tableName };

      if (Name === "*" && !Version) {
        // Fetch all records from the table with pagination
        params = {
          TableName: tableName,
          ExclusiveStartKey: Offset || null, // Use offset if provided
        };
      } else if (Name !== "*" && !Version) {
        // Filter by Name only
        params = {
          TableName: tableName,
          FilterExpression: "Name = :name",
          ExpressionAttributeValues: { ":name": Name },
          ExclusiveStartKey: Offset || null,
        };
      } else if (Name !== "*" && Version) {
        // Filter by Name and Version
        const versionRange = getVersionRange(Version);
        params = {
          TableName: tableName,
          FilterExpression: "Name = :name AND Version BETWEEN :minVersion AND :maxVersion",
          ExpressionAttributeValues: {
            ":name": Name,
            ":minVersion": versionRange.min,
            ":maxVersion": versionRange.max,
          },
          ExclusiveStartKey: Offset || null,
        };
      }

      // Query DynamoDB
      const response = await dynamoDB.scan(params).promise();
      paginationOffset = response.LastEvaluatedKey; // Save for next page

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

    // Return the aggregated unique results with pagination header
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Next-Offset": paginationOffset ? JSON.stringify(paginationOffset) : null,
      },
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
