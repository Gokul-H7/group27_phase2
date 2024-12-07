const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const AdmZip = require("adm-zip");

const MAX_PACKAGE_COUNT = 100; // Limit for the number of packages returned
const MAX_REGEX_LENGTH = 100; // Limit the length of the regex pattern

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

    const { RegEx } = JSON.parse(event.body);

    if (!RegEx) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "A 'RegEx' field is required." }),
      };
    }

    // Validate the regex for length and potential maliciousness
    if (RegEx.length > MAX_REGEX_LENGTH) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Regular expression is too long." }),
      };
    }

    let regex;
    try {
      regex = new RegExp(RegEx, "i"); // Create a case-insensitive regex

      // Simple heuristic to catch potentially malicious patterns
      if (RegEx.includes(".*.*.*.*") || /(\.\*){4,}/.test(RegEx)) {
        throw new Error("Potentially malicious regular expression detected.");
      }
    } catch (error) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid or malicious regular expression." }),
      };
    }

    // Scan DynamoDB for all packages
    const params = { TableName: "Packages" };
    const data = await dynamoDB.scan(params).promise();
    const packages = data.Items || [];

    const matchedPackages = [];

    for (const pkg of packages) {
      // Check if the Name matches
      if (regex.test(pkg.Name)) {
        matchedPackages.push({
          Name: pkg.Name,
          Version: pkg.Version,
          ID: pkg.PackageID,
        });
        continue; // Skip README check if Name matches
      }

      // Fetch the README from S3 if S3Key exists
      if (pkg.S3Key) {
        try {
          const s3Params = {
            Bucket: "packages-registry-27", // Replace with your bucket name
            Key: pkg.S3Key,
          };
          console.log("Fetching README content from S3 with key:", pkg.S3Key);
          const s3Object = await s3.getObject(s3Params).promise();
          const zipContent = Buffer.from(s3Object.Body);
          const readme = extractReadme(zipContent);

          if (readme && regex.test(readme)) {
            matchedPackages.push({
              Name: pkg.Name,
              Version: pkg.Version,
              ID: pkg.PackageID,
            });
          }
        } catch (error) {
          console.error(`Failed to process S3 content for ${pkg.S3Key}:`, error);
        }
      }
    }

    // If no matches are found, return 404
    if (matchedPackages.length === 0) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No packages matched the given regular expression." }),
      };
    }

    // Check if results exceed the limit
    if (matchedPackages.length > MAX_PACKAGE_COUNT) {
      return {
        statusCode: 413,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Too many packages returned. Refine your query." }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(matchedPackages, null, 2),
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

// Helper function to extract README content from a ZIP file
function extractReadme(zipContent) {
  try {
    const zip = new AdmZip(zipContent);
    const readmeEntry = zip.getEntries().find((entry) =>
      entry.entryName.match(/README\.md$/i)
    );

    if (readmeEntry) {
      return zip.readAsText(readmeEntry);
    }
  } catch (error) {
    console.error("Error extracting README from ZIP:", error);
  }
  return null;
}
