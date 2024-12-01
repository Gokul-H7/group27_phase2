const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// Helper function to parse version ranges
const parseVersionRange = (version) => {
    if (version.includes("-")) {
        const [start, end] = version.split("-");
        return { start, end };
    }
    if (version.startsWith("~")) {
        const [major, minor, patch] = version.slice(1).split(".").map(Number);
        if (patch !== undefined) {
            return { start: `${major}.${minor}.${patch}`, end: `${major}.${minor + 1}.0` };
        } else if (minor !== undefined) {
            return { start: `${major}.${minor}.0`, end: `${major}.${minor + 1}.0` };
        } else {
            return { start: `${major}.0.0`, end: `${major + 1}.0.0` };
        }
    }
    if (version.startsWith("^")) {
        const [major, minor, patch] = version.slice(1).split(".").map(Number);
        if (major > 0) {
            return { start: `${major}.${minor || 0}.${patch || 0}`, end: `${major + 1}.0.0` };
        } else if (minor > 0) {
            return { start: `${major}.${minor}.${patch || 0}`, end: `${major}.${minor + 1}.0` };
        } else {
            return { start: `${major}.${minor}.${patch}`, end: `${major}.${minor}.${patch + 1}` };
        }
    }
    return { start: version, end: version };
};

exports.handler = async (event) => {
    try {
        console.log("Event received:", JSON.stringify(event, null, 2));

        // Parse input, handling both API Gateway and direct Lambda invocation formats
        let queries;
        if (event.body) {
            queries = JSON.parse(event.body);
        } else {
            queries = event;
        }

        // Wrap single query in array if necessary
        if (!Array.isArray(queries)) {
            queries = [queries];
        }

        let results = [];
        for (const query of queries) {
            if (!query.Name) {
                throw new Error("Each query must have a 'Name' field.");
            }

            if (query.Name === "*") {
                // Wildcard query: retrieve all packages
                const params = { TableName: "Packages" };
                const data = await dynamoDB.scan(params).promise();
                results = results.concat(data.Items || []);
            } else {
                const { Name, Version } = query;

                if (!Version) {
                    // Query by Name only
                    const params = {
                        TableName: "Packages",
                        IndexName: "NameIndex", // Assume a secondary index on Name
                        KeyConditionExpression: "#name = :name",
                        ExpressionAttributeNames: { "#name": "Name" },
                        ExpressionAttributeValues: { ":name": Name },
                    };
                    const data = await dynamoDB.query(params).promise();
                    results = results.concat(data.Items || []);
                } else {
                    // Handle version ranges
                    const { start, end } = parseVersionRange(Version);

                    const params = {
                        TableName: "Packages",
                        FilterExpression: "#name = :name AND #version BETWEEN :start AND :end",
                        ExpressionAttributeNames: {
                            "#name": "Name",
                            "#version": "Version",
                        },
                        ExpressionAttributeValues: {
                            ":name": Name,
                            ":start": start,
                            ":end": end,
                        },
                    };
                    const data = await dynamoDB.scan(params).promise(); // Use scan for version range queries
                    results = results.concat(data.Items || []);
                }
            }
        }

        const formattedResults = results.map((item) => ({
            Version: item.Version,
            Name: item.Name,
            ID: item.ID,
        }));

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formattedResults || []),
        };
    } catch (error) {
        console.error("Error processing request:", error);

        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: error.message || "An unknown error occurred." }),
        };
    }
};
