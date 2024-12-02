exports.handler = async (event) => {
  const AWS = require("aws-sdk");
  const dynamoDB = new AWS.DynamoDB.DocumentClient();
  const s3 = new AWS.S3();
  const tableName = "Packages"; // Replace with your table name
  const bucketName = "packages-registry-27"; // Replace with your S3 bucket name

  try {
      console.log("Event received:", JSON.stringify(event, null, 2));

      // Extract the {id} path parameter
      const { id } = event.pathParameters || {};
      if (!id) {
          throw new Error("Package ID is required.");
      }

      // Use the full ID as the PackageID (partition key)
      const PackageID = id;

      // Extract Version from the PackageID
      const Version = id.split("-").slice(-1)[0]; // Extract version (last part of ID)
      console.log("Extracted PackageID:", PackageID);
      console.log("Extracted Version:", Version);

      // Query DynamoDB for the package metadata
      const getMetadataParams = {
          TableName: tableName,
          Key: {
              PackageID,
              Version
          }
      };

      const metadataResult = await dynamoDB.get(getMetadataParams).promise();
      const metadata = metadataResult.Item;

      if (!metadata) {
          return {
              statusCode: 404,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ error: "Package not found." })
          };
      }

      console.log("DynamoDB Metadata:", JSON.stringify(metadata, null, 2));

      // Extract URL from Metadata map attribute
      const URL = metadata.Metadata && metadata.Metadata.URL ? metadata.Metadata.URL : null;

      // Fetch the package content (ZIP file) from S3
      let content = "";
      if (metadata.S3Key) {
          try {
              const s3Params = {
                  Bucket: bucketName,
                  Key: metadata.S3Key
              };
              console.log("Fetching content from S3 with key:", metadata.S3Key);
              const s3Data = await s3.getObject(s3Params).promise();
              content = s3Data.Body.toString("base64"); // Encode content as Base64
          } catch (error) {
              console.error(`Failed to fetch S3 content for ${metadata.S3Key}:`, error);
              throw new Error("Error retrieving package content from S3.");
          }
      }

      // Build the response
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
                  Content: content, // Base64-encoded ZIP file content
                  JSProgram: metadata.JSProgram || null,
                  URL: URL // Extracted from Metadata map
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
