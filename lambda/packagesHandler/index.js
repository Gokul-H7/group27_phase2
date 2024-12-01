const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const parseVersionRange = (version) => {
    if (typeof version !== "string") throw new Error("Version must be a string.");

    if (version.startsWith("~")) {
        const [major, minor, patch] = version.slice(1).split(".").map(Number);
        if (patch !== undefined) {
            return { start: `${major}.${minor}.${patch}`, end: `${major}.${minor + 1}.0` };
        } else if (minor !== undefined) {
            return { start: `${major}.${minor}.0`, end: `${major}.${minor + 1}.0` };
        } else {
            return { start: `${major}.0.0`, end: `${major + 1}.0.0` };
        }
    } else if (version.startsWith("^")) {
        const [major, minor, patch] = version.slice(1).split(".").map(Number);
        if (major > 0) {
            return { start: `${major}.${minor || 0}.${patch || 0}`, end: `${major + 1}.0.0` };
        } else if (minor > 0) {
            return { start: `${major}.${minor}.${patch || 0}`, end: `${major}.${minor + 1}.0` };
        } else {
            return { start: `${major}.${minor}.${patch}`, end: `${major}.${minor}.${patch + 1}` };
        }
    } else {
        return { start: version, end: version };
    }
};

exports.handler = async (event) => {
    console.log("Event received:", JSON.stringify(event, null, 2));
    try {
        if (!event.body) {
            throw new Error("Request body is empty or undefined.");
        }

        let queries = JSON.parse(event.body);

        // Handle single query case by wrapping it into an array
        if (!Array.isArray(queries)) {
            queries = [queries];
        }

        let results = [];
        for (const query of queries) {
            if (!query.Name) throw new Error("Each query must have a 'Name' field.");

            if (query.Name === "*") {
                const params = {
                    TableName: "Packages",
                };
                const data = await dynamoDB.scan(params).promise();
                results = results.concat(data.Items || []);
            } else {
                const { Name, Version } = query;

                let params = {
                    TableName: "Packages",
                    KeyConditionExpression: "Name = :name",
                    ExpressionAttributeValues: {
                        ":name": Name,
                    },
                };

                if (Version) {
                    const { start, end } = parseVersionRange(Version);
                    params.FilterExpression = "#version BETWEEN :start AND :end";
                    params.ExpressionAttributeNames = {
                        "#version": "Version",
                    };
                    params.ExpressionAttributeValues[":start"] = start;
                    params.ExpressionAttributeValues[":end"] = end;
                }

                const data = await dynamoDB.query(params).promise();
                results = results.concat(data.Items || []);
            }
        }

        const formattedResults = results.map((item) => ({
            Version: item.Version,
            Name: item.Name,
            ID: item.ID,
        }));

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(formattedResults || []),
        };
    } catch (error) {
        console.error("Error processing request:", error);

        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ error: error.message || "An unknown error occurred." }),
        };
    }
};