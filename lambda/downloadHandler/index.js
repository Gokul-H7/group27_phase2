exports.handler = async (event) => {
  const AWS = require("aws-sdk");
  const dynamoDB = new AWS.DynamoDB.DocumentClient();
  const tableName = "Packages"; // Replace with your DynamoDB table name

  try {
      const { id } = event.pathParameters || {};
      if (!id) {
          throw new Error("Package ID is required.");
      }

      // Extract PackageID and Version from the id
      const [PackageID, Version] = id.split("-");

      const getMetadataParams = {
          TableName: tableName,
          Key: {
              PackageID, // Partition key
              Version    // Sort key
          }
      };

      // Fetch metadata from DynamoDB
      const metadataResult = await dynamoDB.get(getMetadataParams).promise();
      const metadata = metadataResult.Item;

      if (!metadata) {
          return {
              statusCode: 404,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ error: "Package not found." })
          };
      }

      // Fetch package content from S3 (logic omitted for brevity)
      // ...

      return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              metadata: {
                  Name: metadata.Name,
                  Version: metadata.Version,
                  ID: metadata.PackageID
              },
              data: {
                  Content: "Base64-encoded-content",
                  JSProgram: metadata.JSProgram,
                  URL: metadata.URL || null
              }
          })
      };
  } catch (error) {
      console.error("Error processing request:", error);
      return {
          statusCode: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: error.message || "An unknown error occurred." })
      };
  }
};
