const AWS = require('aws-sdk');
const https = require('https');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const apiBaseURL = 'https://7bbav0i1xd.execute-api.us-east-2.amazonaws.com/dev';

exports.handler = async (event) => {
  const { id } = event.pathParameters || {};
  if (!id) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "PackageID is required" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (error) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON format" }),
    };
  }

  const { metadata = {}, data = {} } = body;
  const { Name: newName, Version: newVersion } = metadata;
  const { Content, URL, debloat, JSProgram } = data;

  // Ensure only one of URL or Content is provided
  if (URL && Content) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Provide either URL or Content, not both." }),
    };
  }

  try {
    // Check if the package exists
    const packageExists = await doesPackageExist(id);
    if (!packageExists) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Package does not exist" }),
      };
    }

    // Validate or fetch the latest version
    const finalVersion = newVersion || (await getNextVersion(id));

    // Determine the final URL and Content
    const finalURL = URL || packageExists.Metadata.URL;
    const finalContent = Content || packageExists.Metadata.Content;

    if (!finalURL && !finalContent) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Either URL or Content must be provided or already exist in the package." }),
      };
    }

    // Prepare the upload request body
    const uploadRequestBody = {
      Name: newName || packageExists.Metadata.Name,
      Version: finalVersion,
      JSProgram,
    };
    if (finalURL) uploadRequestBody.URL = finalURL;
    if (finalContent) uploadRequestBody.Content = finalContent;
    if (debloat !== undefined) uploadRequestBody.debloat = debloat;

    // Send the upload request
    const uploadResponse = await sendUploadRequest(uploadRequestBody);

    return {
      statusCode: uploadResponse.statusCode,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(uploadResponse.body),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to update package", details: error.message }),
    };
  }
};

// Check if the package exists (without requiring Version)
async function doesPackageExist(id) {
  const params = {
    TableName: 'Packages',
    KeyConditionExpression: 'PackageID = :packageID',
    ExpressionAttributeValues: { ':packageID': id },
  };

  try {
    const result = await dynamoDB.query(params).promise();
    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
  } catch (error) {
    console.error('DynamoDB Error:', error);
    throw new Error('Failed to fetch package from DynamoDB');
  }
}

// Fetch the next version of a package
async function getNextVersion(id) {
  const params = {
    TableName: 'Packages',
    KeyConditionExpression: 'PackageID = :packageID',
    ExpressionAttributeValues: { ':packageID': id },
  };

  const data = await dynamoDB.query(params).promise();
  if (!data.Items || data.Items.length === 0) {
    return "1.0.0"; // Default version if no versions exist
  }

  // Sort versions numerically
  const versions = data.Items.map((item) => item.Version).sort((a, b) => {
    const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
    const [bMajor, bMinor, bPatch] = b.split('.').map(Number);

    if (aMajor !== bMajor) return bMajor - aMajor;
    if (aMinor !== bMinor) return bMinor - aMinor;
    return bPatch - aPatch;
  });

  // Extract the latest version
  const [major, minor, patch] = versions[0].split('.').map(Number);

  // Increment the patch version
  return `${major}.${minor}.${patch + 1}`;
}


// Send the upload request
async function sendUploadRequest(uploadRequestBody) {
  const options = {
    hostname: new URL(apiBaseURL).hostname,
    path: '/dev/package',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: JSON.parse(data),
        });
      });
    });

    req.on('error', (error) => reject(error));
    req.write(JSON.stringify(uploadRequestBody));
    req.end();
  });
}
