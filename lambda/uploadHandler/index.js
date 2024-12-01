const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const axios = require("axios");
const secretsManager = new AWS.SecretsManager();

const bucketName = "package-registry-27";
const tableName = "Packages";

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { JSProgram, URL, Name = "Unknown", Version = "1.0.0" } = body;

    if (!URL) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "A 'URL' must be provided for this operation.",
        }),
      };
    }

    // Determine the type of URL (GitHub or npm)
    const isGitHub = URL.includes("github.com");
    const isNpm = URL.includes("npmjs.com");

    if (!isGitHub && !isNpm) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Unsupported URL. Only GitHub and npm links are supported.",
        }),
      };
    }

    // Fetch package details based on the URL type
    let packageDetails;
    if (isGitHub) {
      // Get the GitHub token from AWS Secrets Manager
      const githubToken = await getSecret("GITHUB_TOKEN_2");
      packageDetails = await fetchGitHubPackageDetails(URL, githubToken);
    } else if (isNpm) {
      packageDetails = await fetchNpmPackageDetails(URL);
    }

    if (!packageDetails) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: "Failed to retrieve package details from the provided URL.",
        }),
      };
    }

    // Generate a unique PackageID and S3 key
    const packageId = packageDetails.id || require("crypto").randomUUID();
    const s3Key = `packages/${packageId}/${Version}/file.zip`;

    // Upload details to S3
    const packageContent = Buffer.from(JSON.stringify(packageDetails), "utf-8");
    await s3
      .putObject({
        Bucket: bucketName,
        Key: s3Key,
        Body: packageContent,
      })
      .promise();

    // Save metadata to DynamoDB
    const metadata = {
      PackageID: packageId,
      Version,
      Name: packageDetails.name || Name,
      JSProgram,
      S3Key: s3Key,
      SourceURL: URL,
    };

    await dynamoDB
      .put({
        TableName: tableName,
        Item: metadata,
      })
      .promise();

    // Success response
    return {
      statusCode: 201,
      body: JSON.stringify({
        metadata: {
          Name: metadata.Name,
          Version,
          ID: packageId,
        },
        data: {
          S3Key: s3Key,
          JSProgram,
          SourceURL: URL,
        },
      }),
    };
  } catch (error) {
    console.error("Error processing the request:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error", details: error.message }),
    };
  }
};

// Helper to fetch the GitHub token from Secrets Manager
async function getSecret(secretName) {
  const response = await secretsManager
    .getSecretValue({ SecretId: secretName })
    .promise();
  return JSON.parse(response.SecretString).GITHUB_TOKEN_2;
}

// Helper to fetch package details from GitHub
async function fetchGitHubPackageDetails(githubUrl, token) {
  try {
    // Extract owner and repo from GitHub URL
    const [, owner, repo] = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);

    // GitHub API request
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    return {
      id: response.data.id,
      name: response.data.name,
      description: response.data.description,
      stars: response.data.stargazers_count,
      forks: response.data.forks_count,
      watchers: response.data.watchers_count,
    };
  } catch (error) {
    console.error("Failed to fetch GitHub package details:", error);
    return null;
  }
}

// Helper to fetch package details from npm
async function fetchNpmPackageDetails(npmUrl) {
  try {
    // Extract package name from npm URL
    const [, packageName] = npmUrl.match(/npmjs\.com\/package\/([^\/]+)/);

    // NPM registry API request
    const response = await axios.get(`https://registry.npmjs.org/${packageName}`);

    return {
      id: response.data._id,
      name: response.data.name,
      description: response.data.description,
      version: response.data["dist-tags"].latest,
      license: response.data.license,
    };
  } catch (error) {
    console.error("Failed to fetch NPM package details:", error);
    return null;
  }
}
