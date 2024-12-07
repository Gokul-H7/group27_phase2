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

  // Ensure only one of URL or Content is provided in the input
  if (URL && Content) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Provide either URL or Content, not both." }),
    };
  }

  try {
    // Check if the package exists
    const existingPackage = await doesPackageExist(id);
    if (!existingPackage) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Package does not exist" }),
      };
    }

    const finalName = newName || existingPackage.Metadata.Name;

    // Fetch all versions of the package
    const allVersions = await getAllVersions(finalName);

    // Validate the provided version number
    if (newVersion && !isValidNewVersion(newVersion, allVersions)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: `Provided version (${newVersion}) is invalid. Older patch versions are not allowed.`,
        }),
      };
    }

    // Determine the final URL and Content
    const finalURL = URL || (Content ? null : existingPackage.Metadata.URL);
    const finalContent = Content || (URL ? null : existingPackage.Metadata.Content);

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
      Version: newVersion,
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

// Fetch all versions of a package
async function getAllVersions(Name) {
  const params = {
    TableName: 'Packages',
    FilterExpression: "#name = :name",
    ExpressionAttributeNames: { "#name": "Name" },
    ExpressionAttributeValues: { ":name": Name },
  };

  const data = await dynamoDB.scan(params).promise();
  return data.Items ? data.Items.map((item) => item.Version) : [];
}

// Validate the provided version against existing versions
function isValidNewVersion(newVersion, allVersions) {
  const [newMajor, newMinor, newPatch] = newVersion.split('.').map(Number);

  // Check if a higher patch version exists in the same major and minor combination
  const sameMajorMinorVersions = allVersions.filter((version) => {
    const [major, minor] = version.split('.').map(Number);
    return major === newMajor && minor === newMinor;
  });

  if (sameMajorMinorVersions.length > 0) {
    const latestPatch = Math.max(...sameMajorMinorVersions.map((version) => {
      const [, , patch] = version.split('.').map(Number);
      return patch;
    }));

    // Reject if the provided patch version is less than or equal to the latest patch
    if (newPatch <= latestPatch) {
      return false;
    }
  }

  // Allow any version that doesn't violate the patch restriction
  return true;
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
