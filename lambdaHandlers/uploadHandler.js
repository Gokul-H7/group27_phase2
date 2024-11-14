const AWS = require('aws-sdk');
const https = require('https');
const s3 = new AWS.S3();
const secretsManager = new AWS.SecretsManager();

exports.handler = async (event) => {
  try {
    const { githubLink, version } = JSON.parse(event.body);

    // Extract the repository name from the GitHub URL
    const repoNameMatch = githubLink.match(/github\.com\/([^/]+\/[^/]+)/);
    if (!repoNameMatch) {
      throw new Error("Invalid GitHub URL format.");
    }
    const repoName = repoNameMatch[1];
    const zipFileName = `${repoName.split('/')[1]}.zip`;

    // Get GitHub token from Secrets Manager
    const { SecretString } = await secretsManager.getSecretValue({ SecretId: 'GITHUB_TOKEN' }).promise();
    const githubToken = JSON.parse(SecretString).GITHUB_TOKEN;

    // Construct the GitHub API URL for downloading the zip archive
    const zipUrl = `${githubLink}/archive/refs/heads/main.zip`;

    // Fetch the zip file with authentication
    const zipFileBuffer = await fetchZipFile(zipUrl, githubToken);

    // Define the S3 key using the specified directory structure
    const s3Key = `packages-registry-27/${repoName}/${version}/${zipFileName}`;

    // Upload the zip file to S3
    await s3.putObject({
      Bucket: 'packages-registry-27',
      Key: s3Key,
      Body: zipFileBuffer,
      ContentType: 'application/zip',
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'File uploaded successfully', s3Key }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error processing request', error: error.message }),
    };
  }
};

// Helper function to download the zip file with authorization
const fetchZipFile = (url, token) => {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'aws-lambda',
      }
    };

    https.get(url, options, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get file, status code: ${response.statusCode}`));
      }

      const data = [];
      response.on('data', (chunk) => data.push(chunk));
      response.on('end', () => resolve(Buffer.concat(data)));
    }).on('error', (err) => reject(err));
  });
};


// const AWS = require('aws-sdk');
// const s3 = new AWS.S3();

// exports.uploadHandler = async (body) => {
//     const { packageName, version, fileContent } = body;
//     const key = "packages/" + packageName + "/" + version + "/package.zip";

//     const params = {
//         Bucket: 'packages-registry-27',  // Replace with your bucket name
//         Key: key,
//         Body: Buffer.from(fileContent, 'base64'),  // Assuming base64 encoded content
//         ContentType: 'application/zip',
//     };

//     try {
//         await s3.putObject(params).promise();
//         return {
//             statusCode: 200,
//             body: JSON.stringify({ message: 'Package uploaded successfully!' }),
//         };
//     } catch (err) {
//         return {
//             statusCode: 500,
//             body: JSON.stringify({ error: err.message }),
//         };
//     }
// };