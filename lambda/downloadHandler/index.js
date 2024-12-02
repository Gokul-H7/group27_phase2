const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

exports.handler = async (event) => {
    try {
        const tableName = "Packages"; // Replace with your DynamoDB table name
        const bucketName = "packages-registry-27"; // Replace with your S3 bucket name

        // Extract ID from path parameters
        const { id } = event.pathParameters;
        if (!id) {
            throw new Error("Package ID is required.");
        }

        // Fetch metadata from DynamoDB
        const getMetadataParams = {
            TableName: tableName,
            Key: {
                PackageID: id, // Partition key
            },
        };

        const metadataResult = await dynamoDB.get(getMetadataParams).promise();
        const metadata = metadataResult.Item;

        if (!metadata) {
            return {
                statusCode: 404,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: "Package not found." }),
            };
        }

        // Fetch package content from S3
        const s3Params = {
            Bucket: bucketName,
            Key: metadata.S3Key,
        };

        let content;
        try {
            const s3Data = await s3.getObject(s3Params).promise();
            content = s3Data.Body.toString("base64"); // Encode content as Base64
        } catch (error) {
            console.error(`Failed to fetch S3 content for ${metadata.S3Key}:`, error);
            throw new Error("Error retrieving package content.");
        }

        // Build response
        const response = {
            metadata: {
                Name: metadata.Name,
                Version: metadata.Version,
                ID: metadata.PackageID,
            },
            data: {
                Content: content,
                JSProgram: metadata.JSProgram,
            },
        };

        // Add URL to response if available
        if (metadata.URL) {
            response.data.URL = metadata.URL;
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
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
