const AWS = require("aws-sdk");
const https = require("https");
const { v4: uuidv4 } = require("uuid");

const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const secretsManager = new AWS.SecretsManager();

const BUCKET_NAME = "package-registry-27";
const TABLE_NAME = "Packages";

async function getGitHubToken() {
  try {
    // Fetch the secret from Secrets Manager
    const secret = await secretsManager.getSecretValue({ SecretId: "GITHUB_TOKEN_2" }).promise();

    // Validate the secret
    if (!secret || !secret.SecretString) {
      throw new Error("SecretString is undefined or missing.");
    }

    const secretObject = JSON.parse(secret.SecretString);
    if (!secretObject.token) {
      throw new Error("Token field is missing in the secret.");
    }

    return secretObject.token;
  } catch (error) {
    console.error("Error fetching GitHub token:", error.message);
    throw new Error("Failed to retrieve GitHub token.");
  }
}

async function fetchContent(url, token = null) {
  return new Promise((resolve, reject) => {
    const options = token
      ? { headers: { Authorization: `Bearer ${token}`, "User-Agent": "AWS-Lambda" } }
      : {};
    https.get(url, options, (res) => {
      let data = [];
      res.on("data", (chunk) => data.push(chunk));
      res.on("end", () => resolve(Buffer.concat(data)));
    }).on("error", (err) => reject(err));
  });
}

async function uploadToS3(key, body) {
  const params = { Bucket: BUCKET_NAME, Key: key, Body: body };
  return s3.upload(params).promise();
}

async function updateDynamoDB(metadata) {
  const params = {
    TableName: TABLE_NAME,
    Item: metadata,
  };
  return dynamoDB.put(params).promise();
}

exports.handler = async (event) => {
  try {
    // Parse and validate the input
    const body = JSON.parse(event.body);
    const { Content, JSProgram, URL, Name, Version } = body;

    if (!Name || !Version) {
      return { statusCode: 400, body: JSON.stringify({ error: "Name and Version are required." }) };
    }

    if ((Content && URL) || (!Content && !URL)) {
      return { statusCode: 400, body: JSON.stringify({ error: "Provide either Content or URL, but not both." }) };
    }

    const packageID = `${Name}_${Version}`; // Generate unique PackageID
    let contentBuffer;

    // Handle Content or URL
    if (Content) {
      contentBuffer = Buffer.from(Content, "base64");
    } else if (URL) {
      const token = URL.includes("github.com") ? await getGitHubToken() : null;
      let contentUrl;

      if (URL.includes("github.com")) {
        contentUrl = `${URL}/archive/refs/heads/main.zip`;
      } else if (URL.includes("npmjs.com")) {
        const packageName = URL.split("/").pop();
        contentUrl = `https://registry.npmjs.org/${packageName}/latest`;
      } else {
        return { statusCode: 400, body: JSON.stringify({ error: "Unsupported URL format." }) };
      }

      contentBuffer = await fetchContent(contentUrl, token);
    }

    // Upload to S3
    const s3Key = `${packageID}.zip`;
    await uploadToS3(s3Key, contentBuffer);

    // Prepare metadata
    const metadata = {
      PackageID: packageID,
      Version,
      Name,
      Metadata: { JSProgram },
      S3Key: s3Key,
    };

    // Update DynamoDB
    await updateDynamoDB(metadata);

    // Response
    const response = {
      metadata: {
        Name,
        Version,
        ID: packageID,
      },
      data: {
        Content: contentBuffer.toString("base64"),
        JSProgram,
        URL,
      },
    };

    return { statusCode: 201, body: JSON.stringify(response) };
  } catch (err) {
    console.error("Error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal Server Error",
        details: err.message,
      }),
    };
  }
};
