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
  const { Name: dataName, Content, URL, debloat, JSProgram } = data;

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
    const existingPackage = await getPackageById(id);
    if (!existingPackage) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Package does not exist" }),
      };
    }

    // Determine the updated fields
    const finalName = newName || existingPackage.Metadata.Name;
    const finalVersion = newVersion || (await getNextVersion(finalName));
    const finalURL = URL || existingPackage.Metadata.URL;
    const finalContent = Content || existingPackage.Metadata.Content;

    // Ensure at least one of URL or Content is available
    if (!finalURL && !finalContent) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Either URL or Content must be provided or already exist in the package." }),
      };
    }

    // Prepare the upload request
    const uploadRequestBody = {
      Name: finalName,
      Version: finalVersion,
      JSProgram,
    };
    if (finalURL) uploadRequestBody.URL = finalURL;
    if (finalContent) uploadRequestBody.Content = finalContent;
    if (debloat !== undefined) uploadRequestBody.debloat = debloat;

    // Call the upload handler
    const uploadResponse = await callUploadHandler(uploadRequestBody);
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

// Helper function to fetch an existing package by ID
async function getPackageById(id) {
  const params = {
    TableName: 'Packages',
    Key: { PackageID: id },
  };

  const result = await dynamoDB.get(params).promise();
  return result.Item || null;
}

// Helper function to get the next version
async function getNextVersion(Name) {
  const params = {
    TableName: 'Packages',
    FilterExpression: "#name = :name",
    ExpressionAttributeNames: { "#name": "Name" },
    ExpressionAttributeValues: { ":name": Name },
  };

  const data = await dynamoDB.scan(params).promise();
  if (!data.Items || data.Items.length === 0) {
    return "1.0.0";
  }

  const versions = data.Items.map((item) => item.Version).sort((a, b) => {
    const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
    const [bMajor, bMinor, bPatch] = b.split(".").map(Number);

    if (aMajor !== bMajor) return bMajor - aMajor;
    if (aMinor !== bMinor) return bMinor - aMinor;
    return bPatch - aPatch;
  });

  const [major, minor, patch] = versions[0].split(".").map(Number);
  if (patch < 9) return `${major}.${minor}.${patch + 1}`;
  if (minor < 9) return `${major}.${minor + 1}.0`;
  return `${major + 1}.0.0`;
}

// Helper function to call the upload handler
async function callUploadHandler(uploadRequestBody) {
  const options = {
    method: 'POST',
    hostname: new URL(apiBaseURL).hostname,
    path: '/dev/package',
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
