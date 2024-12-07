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
    // Fetch the latest version if not provided
    const currentVersion = newVersion || (await getLatestVersion(id));

    // Fetch existing package information
    const existingPackage = await getPackageById(id, currentVersion);
    if (!existingPackage) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Package does not exist" }),
      };
    }

    const finalName = newName || existingPackage.Metadata.Name;

    // Validate the provided version number
    if (newVersion && !isValidNewVersion(newVersion, id)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Provided version (${newVersion}) is invalid. Older patch versions are not allowed.`,
        }),
      };
    }

    // Determine the final URL and Content
    const finalURL = URL || existingPackage.Metadata.URL;
    const finalContent = Content || existingPackage.Metadata.Content;

    if (!finalURL && !finalContent) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Either URL or Content must be provided or already exist in the package." }),
      };
    }

    // Prepare the upload request body
    const uploadRequestBody = {
      Name: finalName,
      Version: newVersion || currentVersion,
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

// Fetch a package by ID and Version
async function getPackageById(id, version) {
  const params = {
    TableName: 'Packages',
    Key: {
      PackageID: id,
      Version: version,
    },
  };

  try {
    const result = await dynamoDB.get(params).promise();
    return result.Item || null;
  } catch (error) {
    console.error('DynamoDB Error:', error);
    throw new Error('Failed to fetch package from DynamoDB');
  }
}

// Fetch the latest version of a package
async function getLatestVersion(id) {
  const params = {
    TableName: 'Packages',
    KeyConditionExpression: 'PackageID = :packageID',
    ExpressionAttributeValues: { ':packageID': id },
  };

  const data = await dynamoDB.query(params).promise();
  if (!data.Items || data.Items.length === 0) {
    throw new Error('No versions found for the specified package');
  }

  // Sort by version and return the latest
  const sortedVersions = data.Items.map((item) => item.Version).sort((a, b) => {
    const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
    const [bMajor, bMinor, bPatch] = b.split('.').map(Number);

    if (aMajor !== bMajor) return bMajor - aMajor;
    if (aMinor !== bMinor) return bMinor - aMinor;
    return bPatch - aPatch;
  });

  return sortedVersions[0];
}

// Validate new version against the current package
function isValidNewVersion(newVersion, id) {
  const [newMajor, newMinor, newPatch] = newVersion.split('.').map(Number);
  const latestVersion = getLatestVersion(id).split('.').map(Number);

  // Allow any major or minor update
  if (newMajor > latestVersion[0]) return true;
  if (newMajor === latestVersion[0] && newMinor > latestVersion[1]) return true;

  // Allow only newer patches within the same major/minor
  if (newMajor === latestVersion[0] && newMinor === latestVersion[1]) {
    return newPatch > latestVersion[2];
  }

  return false;
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
