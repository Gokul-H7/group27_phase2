const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

exports.handler = async (event) => {
    console.log("Reset endpoint called.");
    console.log("Event received:", JSON.stringify(event, null, 2));

    const tableName = "Packages";
    const bucketName = "packages-registry-27";

    try {
        // Scan the DynamoDB table to retrieve all items
        const scanParams = { TableName: tableName };
        const itemsToDelete = [];
        let scanResult;

        do {
            scanResult = await dynamoDB.scan(scanParams).promise();
            itemsToDelete.push(...scanResult.Items);

            // Update the exclusiveStartKey for pagination
            scanParams.ExclusiveStartKey = scanResult.LastEvaluatedKey;
        } while (scanResult.LastEvaluatedKey);

        console.log(`Found ${itemsToDelete.length} items to delete.`);

        // Process deletion of S3 objects and DynamoDB items
        for (const item of itemsToDelete) {
            // Delete the S3 object
            if (item.S3Key) {
                const deleteS3Params = {
                    Bucket: bucketName,
                    Key: item.S3Key,
                };

                try {
                    await s3.deleteObject(deleteS3Params).promise();
                    console.log(`Deleted S3 object: ${item.S3Key}`);
                } catch (error) {
                    console.error(`Failed to delete S3 object ${item.S3Key}:`, error);
                    // Continue even if an S3 deletion fails
                }
            }

            // Delete the DynamoDB item
            const deleteDynamoParams = {
                TableName: tableName,
                Key: {
                    PackageID: item.PackageID, // Partition key
                    Version: item.Version,     // Sort key
                },
            };

            try {
                await dynamoDB.delete(deleteDynamoParams).promise();
                console.log(`Deleted DynamoDB item: ${item.PackageID}, Version: ${item.Version}`);
            } catch (error) {
                console.error(`Failed to delete DynamoDB item ${item.PackageID}, Version: ${item.Version}:`, error);
                // Continue even if a DynamoDB deletion fails
            }
        }

        // Return successful response
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "Registry reset to default state." }, null, 2),
        };
    } catch (error) {
        console.error("Error during reset operation:", error);

        // Return error response
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
                { error: error.message || "An unknown error occurred." },
                null,
                2
            ),
        };
    }
};
