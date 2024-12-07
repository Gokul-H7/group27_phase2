const AWS = require('aws-sdk');
const https = require('https');
const AdmZip = require('adm-zip');
const terser = require('terser');
const s3 = new AWS.S3();
const secretsManager = new AWS.SecretsManager();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  let body;

  // Parse the event body
  try {
    body = JSON.parse(event.body); // Parse the incoming JSON
  } catch (error) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON format" }, null, 2),
    };
  }

  // Extract parameters from the parsed body
  const { Name, URL, Content, JSProgram, debloat = false } = body;
  let { Version } = body;

  // Validate mandatory inputs
  if (!Name || !JSProgram) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing required fields: Name or JSProgram" }, null, 2),
    };
  }

  if (URL && Content) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        { error: "Both URL and Content cannot be provided at the same time. Provide only one." },
        null,
        2
      ),
    };
  }

  if (!URL && !Content) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        { error: "Either URL or Content must be provided" },
        null,
        2
      ),
    };
  }

  try {
    // Determine version if not provided
    if (!Version) {
      Version = await getNextVersion(Name);
    }

    const PackageID = `${Name}-${Version}`;
    const s3BucketName = 'packages-registry-27';
    const s3Key = `${Name}/${Version}/${PackageID}.zip`;

    let metadata = {
      Name,
      Version,
      ID: PackageID.toLowerCase(),
    };

    // Check if the package with the same PackageID already exists
    const exists = await checkPackageExists(PackageID, Version);
    if (exists) {
      return {
        statusCode: 409,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          { error: "Package already exists with the same Name and Version." },
          null,
          2
        ),
      };
    }

    // Proceed with processing URL or Content
    if (URL) {
      if (!URL.includes('github.com') && !URL.includes('npmjs.com')) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            { error: "URL must be a valid GitHub or npmjs.com link" },
            null,
            2
          ),
        };
      }

      const githubToken = await getSecret('GITHUB_TOKEN_2');
      const { base64Content, s3Response } = await processURLToS3(URL, githubToken, s3BucketName, s3Key);

      await updateDynamoDB(PackageID, Version, metadata, s3Key, URL);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          {
            metadata,
            data: {
              URL,
              Content: base64Content,
              JSProgram,
            },
          },
          null,
          2
        ),
      };
    } else if (Content) {
      let contentBuffer = Buffer.from(Content, 'base64');

      if (debloat) {
        contentBuffer = await debloatContent(contentBuffer); // Apply debloating if requested
      }

      await uploadContentToS3(contentBuffer, s3BucketName, s3Key);
      await updateDynamoDB(PackageID, Version, metadata, s3Key);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          {
            metadata,
            data: {
              Content,
              JSProgram,
            },
          },
          null,
          2
        ),
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        {
          error: "Failed to process package",
          details: error.message,
        },
        null,
        2
      ),
    };
  }
};

// Helper function to determine the next version
async function getNextVersion(Name) {
  const params = {
    TableName: "Packages",
    FilterExpression: "#name = :name",
    ExpressionAttributeNames: { "#name": "Name" },
    ExpressionAttributeValues: { ":name": Name },
  };

  const data = await dynamoDB.scan(params).promise();
  if (!data.Items || data.Items.length === 0) {
    return "1.0.0"; // Default version if no packages exist for the Name
  }

  // Extract and sort versions
  const versions = data.Items.map((item) => item.Version).sort((a, b) => {
    const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
    const [bMajor, bMinor, bPatch] = b.split(".").map(Number);

    if (aMajor !== bMajor) return bMajor - aMajor;
    if (aMinor !== bMinor) return bMinor - aMinor;
    return bPatch - aPatch;
  });

  // Calculate the next version
  const [major, minor, patch] = versions[0].split(".").map(Number);
  const nextPatch = patch + 1;
  return `${major}.${minor}.${nextPatch}`;
}


// Helper function for debloating
async function debloatContent(contentBuffer) {
  const zip = new AdmZip(contentBuffer);
  const newZip = new AdmZip();

  // Iterate through the files in the ZIP
  zip.getEntries().forEach((entry) => {
    if (entry.isDirectory) {
      // Retain directories as is
      newZip.addFile(entry.entryName, Buffer.alloc(0), entry.comment);
    } else if (entry.entryName.endsWith(".js")) {
      // Minify JavaScript files using terser
      const originalCode = zip.readAsText(entry);
      const minifiedCode = terser.minify(originalCode).code || originalCode; // Fallback to original code if minification fails
      newZip.addFile(entry.entryName, Buffer.from(minifiedCode), entry.comment);
    } else if (entry.entryName.match(/\.json$|\.css$/)) {
      // Retain JSON and CSS files
      const fileContent = zip.readFile(entry);
      newZip.addFile(entry.entryName, fileContent, entry.comment);
    }
    // Other file types are excluded (e.g., documentation, tests)
  });

  return newZip.toBuffer(); // Return the optimized ZIP as a buffer
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
