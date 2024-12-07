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
    // Fetch existing package information
    const existingPackage = await getPackageById(id);
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

    // Determine the final version
    const finalVersion = newVersion || (await getNextVersion(finalName, allVersions));

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

// Helper function to fetch all versions of a package
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

// Helper function to validate the provided version against existing versions
function isValidNewVersion(newVersion, allVersions) {
  const [newMajor, newMinor, newPatch] = newVersion.split('.').map(Number);

  // Filter versions by the same major and minor
  const sameMajorMinorVersions = allVersions.filter((version) => {
    const [major, minor] = version.split('.').map(Number);
    return major === newMajor && minor === newMinor;
  });

  // Check if the new patch is greater within the same major/minor
  if (sameMajorMinorVersions.length > 0) {
    const latestPatch = Math.max(...sameMajorMinorVersions.map((version) => {
      const [, , patch] = version.split('.').map(Number);
      return patch;
    }));
    if (newPatch <= latestPatch) {
      return false; // Older or same patch version is invalid
    }
  }

  // Allow any major or minor update
  return true;
}

// Helper function to send the upload request
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

// Helper function to fetch a package by ID
async function getPackageById(id) {
  const params = {
    TableName: 'Packages',
    Key: { PackageID: id },
  };

  const result = await dynamoDB.get(params).promise();
  return result.Item || null;
}
