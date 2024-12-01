const AWS = require("aws-sdk");
const https = require("https");
const s3 = new AWS.S3();
const secretsManager = new AWS.SecretsManager();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const BUCKET_NAME = "package-registry-27";
const TABLE_NAME = "Packages";

exports.handler = async (event) => {
  try {
    // Parse and validate request body
    const body = JSON.parse(event.body);
    const { Name, Version, JSProgram, URL, Content } = body;

    if (!Name || !Version) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Name and Version are required." }),
      };
    }

    if ((Content && URL) || (!Content && !URL)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Provide either Content or URL, but not both." }),
      };
    }

    const packageID = `${Name}_${Version}`; // Unique ID for the package
    const s3Key = `${packageID}.zip`;

    let contentBuffer;

    if (URL) {
      // Handle URL case
      const githubToken = await getSecret("GITHUB_TOKEN_2");
      contentBuffer = await downloadFromURL(URL, githubToken);
    } else if (Content) {
      // Handle Content case
      contentBuffer = Buffer.from(Content, "base64");
    } else {
      throw new Error("Invalid input: URL or Content is required.");
    }

    // Upload to S3
    await uploadToS3(s3Key, contentBuffer);

    // Update DynamoDB
    const metadata = {
      PackageID: packageID,
      Version,
      Name,
      Metadata: { JSProgram },
      S3Key: s3Key,
    };
    await updateDynamoDB(metadata);

    // Response
    return {
      statusCode: 201,
      body: JSON.stringify({
        metadata: { Name, Version, ID: packageID },
        data: {
          Content: contentBuffer.toString("base64"),
          JSProgram,
          URL,
        },
      }),
    };
  } catch (error) {
    console.error("Error:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal Server Error",
        details: error.message,
      }),
    };
  }
};

// Download content from a URL (GitHub or other valid URLs)
async function downloadFromURL(url, token) {
  return new Promise((resolve, reject) => {
    const repoNameMatch = url.match(/github\.com\/([^\/]+\/[^\/]+)$/);
    if (!repoNameMatch) return reject(new Error("Invalid GitHub URL format"));

    const repoName = repoNameMatch[1];
    const downloadUrl = `https://api.github.com/repos/${repoName}/zipball`;

    const options = {
      headers: {
        Authorization: `token ${token}`,
        "User-Agent": "AWS-Lambda-Function",
      },
    };

    https.get(downloadUrl, options, (response) => {
      if (response.statusCode === 302 && response.headers.location) {
        https.get(response.headers.location, options, (redirectedResponse) => {
          if (redirectedResponse.statusCode !== 200) {
            return reject(new Error(`Failed to download repository: ${redirectedResponse.statusCode}`));
          }

          const chunks = [];
          redirectedResponse.on("data", (chunk) => chunks.push(chunk));
          redirectedResponse.on("end", () => resolve(Buffer.concat(chunks)));
        }).on("error", reject);
      } else if (response.statusCode === 200) {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
      } else {
        reject(new Error(`Failed to download repository: ${response.statusCode}`));
      }
    }).on("error", reject);
  });
}

// Upload content to S3
async function uploadToS3(key, body) {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: "application/zip",
  };
  return s3.upload(params).promise();
}

// Update DynamoDB
async function updateDynamoDB(metadata) {
  const params = {
    TableName: TABLE_NAME,
    Item: metadata,
  };
  return dynamoDB.put(params).promise();
}

// Retrieve secret from AWS Secrets Manager
// Retrieve secret from AWS Secrets Manager
async function getSecret(secretName) {
  try {
    console.log(`Fetching secret: ${secretName}`);
    const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();

    // Log the raw response from Secrets Manager
    console.log("Raw secret response:", JSON.stringify(data));

    // Check if SecretString is defined
    if (!data || !data.SecretString) {
      throw new Error(`SecretString for ${secretName} is undefined or missing.`);
    }

    // Parse the secret
    const secret = JSON.parse(data.SecretString);
    console.log("Parsed secret object:", secret);

    // Ensure the required token field exists
    if (!secret.token && !secret.GITHUB_TOKEN_2) {
      throw new Error(`Secret ${secretName} does not contain the expected key 'token' or 'GITHUB_TOKEN_2'.`);
    }

    return secret.token || secret.GITHUB_TOKEN_2;
  } catch (error) {
    console.error(`Error retrieving secret ${secretName}:`, error.message);
    throw new Error(`Failed to retrieve secret: ${error.message}`);
  }
}
