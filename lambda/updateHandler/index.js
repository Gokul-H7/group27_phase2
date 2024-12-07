exports.handler = async (event) => {
  const AWS = require("aws-sdk");
  const dynamoDB = new AWS.DynamoDB.DocumentClient();
  const s3 = new AWS.S3();
  const AdmZip = require("adm-zip");
  const terser = require("terser");

  const tableName = "Packages";
  const bucketName = "packages-registry-27";

  let body;

  try {
    // Parse the event body
    body = JSON.parse(event.body);
  } catch (error) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON format" }, null, 2),
    };
  }

  const { id } = event.pathParameters || {};
  if (!id) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Package ID is required." }),
    };
  }

  const { metadata, data } = body || {};
  if (!data) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Data input is required." }),
    };
  }

  try {
    // Fetch the existing package metadata
    const getParams = {
      TableName: tableName,
      Key: {
        PackageID: id,
        Version: id.split("-").slice(-1)[0], // Extract version from the PackageID
      },
    };

    const result = await dynamoDB.get(getParams).promise();
    const currentPackage = result.Item;

    if (!currentPackage) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Package not found." }),
      };
    }

    console.log("Current Package:", JSON.stringify(currentPackage, null, 2));

    // Generate the next version
    const newVersion = await getNextVersion(currentPackage.Name);

    const newPackageID = `${currentPackage.Name}-${newVersion}`;
    const s3Key = `${currentPackage.Name}/${newVersion}/${newPackageID}.zip`;

    let contentBuffer;

    // Handle URL or Content processing
    if (data.URL) {
      const githubToken = await getSecret("GITHUB_TOKEN_2");
      const { base64Content } = await processURLToS3(data.URL, githubToken, bucketName, s3Key);
      contentBuffer = Buffer.from(base64Content, "base64");
    } else if (data.Content) {
      contentBuffer = Buffer.from(data.Content, "base64");
      if (data.debloat) {
        contentBuffer = await debloatContent(contentBuffer);
      }
    } else {
      throw new Error("Either URL or Content must be provided.");
    }

    // Upload the new version to S3
    await uploadContentToS3(contentBuffer, bucketName, s3Key);

    // Update DynamoDB with the new version
    const newMetadata = {
      Name: currentPackage.Name,
      Version: newVersion,
      ID: newPackageID,
    };

    const updateParams = {
      TableName: tableName,
      Item: {
        PackageID: newPackageID,
        Version: newVersion,
        Name: currentPackage.Name,
        Metadata: newMetadata,
        S3Key: s3Key,
        JSProgram: data.JSProgram || currentPackage.JSProgram,
      },
    };

    if (data.URL) {
      updateParams.Item.Metadata.URL = data.URL;
    }

    await dynamoDB.put(updateParams).promise();

    // Return success response
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        {
          metadata: newMetadata,
          data: {
            Content: contentBuffer.toString("base64"),
            JSProgram: data.JSProgram || currentPackage.JSProgram,
            URL: data.URL || null,
          },
        },
        null,
        2
      ),
    };
  } catch (error) {
    console.error("Error updating package:", error);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || "An unknown error occurred." }),
    };
  }
};

// Helper function to get the next version number
async function getNextVersion(name) {
  const params = {
    TableName: "Packages",
    FilterExpression: "#name = :name",
    ExpressionAttributeNames: { "#name": "Name" },
    ExpressionAttributeValues: { ":name": name },
  };

  const data = await dynamoDB.scan(params).promise();
  const versions = data.Items.map((item) => item.Version);
  return calculateNextVersion(versions);
}

// Helper function to calculate the next version number
function calculateNextVersion(versions) {
  const latestVersion = versions
    .map((v) => v.split(".").map(Number))
    .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0];

  latestVersion[2]++;
  if (latestVersion[2] > 9) {
    latestVersion[2] = 0;
    latestVersion[1]++;
  }
  if (latestVersion[1] > 9) {
    latestVersion[1] = 0;
    latestVersion[0]++;
  }

  return latestVersion.join(".");
}

// Debloating and helper functions (same as uploadHandler)
async function debloatContent(contentBuffer) {
  const zip = new AdmZip(contentBuffer);
  const newZip = new AdmZip();

  zip.getEntries().forEach((entry) => {
    if (entry.isDirectory) {
      newZip.addFile(entry.entryName, Buffer.alloc(0), entry.comment);
    } else if (entry.entryName.endsWith(".js")) {
      const originalCode = zip.readAsText(entry);
      const minifiedCode = terser.minify(originalCode).code || originalCode;
      newZip.addFile(entry.entryName, Buffer.from(minifiedCode), entry.comment);
    } else if (entry.entryName.match(/\.json$|\.css$/)) {
      const fileContent = zip.readFile(entry);
      newZip.addFile(entry.entryName, fileContent, entry.comment);
    }
  });

  return newZip.toBuffer();
}

// Helper function to process URL, download the content, and upload it to S3
async function processURLToS3(link, githubToken, s3BucketName, s3Key) {
  let githubLink = link;

  if (link.includes('npmjs.com')) {
    githubLink = await fetchGithubLinkFromNpm(link);
  }

  const base64Content = await fetchBase64FromURL(githubLink, githubToken);
  const contentBuffer = Buffer.from(base64Content, 'base64');

  const s3Response = await uploadContentToS3(contentBuffer, s3BucketName, s3Key);
  return { base64Content, s3Response };
}

// Helper function to fetch the repository content as a base64 string
async function fetchBase64FromURL(githubLink, githubToken) {
  return new Promise((resolve, reject) => {
    const repoNameMatch = githubLink.match(/github\.com\/([^\/]+\/[^\/]+)$/);
    if (!repoNameMatch) return reject(new Error("Invalid GitHub link format"));
    const repoName = repoNameMatch[1];
    const downloadUrl = `https://api.github.com/repos/${repoName}/zipball`;

    const options = {
      headers: {
        'Authorization': `token ${githubToken}`,
        'User-Agent': 'AWS-Lambda-Function'
      }
    };

    https.get(downloadUrl, options, (response) => {
      if (response.statusCode === 302 && response.headers.location) {
        https.get(response.headers.location, (redirectedResponse) => {
          if (redirectedResponse.statusCode !== 200) {
            return reject(new Error(`Failed to download repository: ${redirectedResponse.statusCode}`));
          }

          const chunks = [];
          redirectedResponse.on('data', (chunk) => chunks.push(chunk));
          redirectedResponse.on('end', () => {
            const buffer = Buffer.concat(chunks);
            resolve(buffer.toString('base64'));
          });
        }).on('error', (error) => reject(new Error(`Redirect failed: ${error.message}`)));
      } else if (response.statusCode === 200) {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer.toString('base64'));
        });
      } else {
        reject(new Error(`Failed to download repository: ${response.statusCode}`));
      }
    }).on('error', (error) => reject(new Error(`Request failed: ${error.message}`)));
  });
}

// Helper function to upload content to S3
async function uploadContentToS3(contentBuffer, s3BucketName, s3Key) {
  const params = {
    Bucket: s3BucketName,
    Key: s3Key,
    Body: contentBuffer,
    ContentType: 'application/zip'
  };

  return s3.upload(params).promise();
}

// Helper function to retrieve the GitHub token from Secrets Manager
async function getSecret(secretName) {
  const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
  return JSON.parse(data.SecretString).GITHUB_TOKEN_2;
}

// Helper function to update DynamoDB
async function updateDynamoDB(PackageID, Version, metadata, s3Key, URL = null) {
  if (URL) {
    metadata.URL = URL; // Add URL to metadata if provided
  }

  const params = {
    TableName: 'Packages',
    Item: {
      PackageID,
      Version,
      Name: metadata.Name,
      Metadata: metadata,
      S3Key: s3Key,
    },
  };

  return dynamoDB.put(params).promise();
}

// Helper function to check if a package already exists
async function checkPackageExists(PackageID, Version) {
  const params = {
    TableName: 'Packages',
    Key: {
      PackageID,
      Version
    }
  };

  const result = await dynamoDB.get(params).promise();
  return !!result.Item; // Returns true if the item exists, false otherwise
}

// Helper function to extract GitHub link from npmjs.com
async function fetchGithubLinkFromNpm(npmLink) {
  return new Promise((resolve, reject) => {
    const packageNameMatch = npmLink.match(/npmjs\.com\/package\/([^\/]+)(\/?.*)$/);
    if (!packageNameMatch) {
      return reject(new Error("Invalid npmjs.com link format"));
    }
    const packageName = packageNameMatch[1];
    const registryUrl = `https://registry.npmjs.org/${packageName}`;

    https.get(registryUrl, (response) => {
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to fetch npm package metadata: ${response.statusCode}`));
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const metadata = JSON.parse(Buffer.concat(chunks).toString());
          const githubLink = metadata.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '');
          if (!githubLink || !githubLink.includes('github.com')) {
            return reject(new Error("No valid GitHub link found in npm package metadata"));
          }
          resolve(githubLink);
        } catch (error) {
          reject(new Error("Failed to parse npm package metadata"));
        }
      });
    }).on('error', (error) => reject(new Error(`Request failed: ${error.message}`)));
  });
}

