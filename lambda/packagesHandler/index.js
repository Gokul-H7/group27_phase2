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

// Helper function to extract Name from PackageID
const extractNameFromPackageID = (packageID) => {
    return packageID.replace(/-\d+\.\d+\.\d+$/, "");
};

exports.handler = async (event) => {
    try {
        console.log("Event received:", JSON.stringify(event, null, 2));

        // Parse the request body
        if (!event.body) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Request body is required." }),
            };
        }

        const queries = JSON.parse(event.body);

        // Wrap single query in array if necessary
        const queryArray = Array.isArray(queries) ? queries : [queries];

        let results = [];
        let seenPackageIDs = new Set(); // Track processed PackageIDs to avoid duplicates

        for (const query of queryArray) {
            if (!query.Name) {
                return {
                    statusCode: 400,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ error: "Each query must have a 'Name' field." }),
                };
            }

            let queryResults = [];
            const { Name, Version } = query;

            if (!Version) {
                // Query by Name only
                const params = { TableName: "Packages" };
                const data = await dynamoDB.scan(params).promise();
                queryResults = (data.Items || []).filter((item) => {
                    const extractedName = extractNameFromPackageID(item.PackageID);
                    return extractedName === Name;
                });
            } else {
                // Handle version ranges
                const { start, end } = parseVersionRange(Version);

                const params = {
                    TableName: "Packages",
                    FilterExpression: "begins_with(#packageID, :name) AND #version BETWEEN :start AND :end",
                    ExpressionAttributeNames: {
                        "#packageID": "PackageID",
                        "#version": "Version",
                    },
                    ExpressionAttributeValues: {
                        ":name": `${Name}-`,
                        ":start": start,
                        ":end": end,
                    },
                };
                const data = await dynamoDB.scan(params).promise();
                queryResults = data.Items || [];
            }

            // Filter duplicates and maintain query order
            queryResults.forEach((item) => {
                if (!seenPackageIDs.has(item.PackageID)) {
                    seenPackageIDs.add(item.PackageID);
                    results.push({
                        Version: item.Version,
                        Name: extractNameFromPackageID(item.PackageID),
                        ID: item.ID,
                        PackageID: item.PackageID,
                    });
                }
            });
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(results, null, 2),
        };
    } catch (error) {
        console.error("Error processing request:", error);

        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: error.message || "An unknown error occurred." }, null, 2),
        };
    }
};
