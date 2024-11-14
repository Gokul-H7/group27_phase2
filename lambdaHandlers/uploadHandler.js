const AWS = require('aws-sdk');
const https = require('https');
const s3 = new AWS.S3();
const secretsManager = new AWS.SecretsManager();

exports.handler = async (event) => {
    const { githubLink, version } = event;

    if (!githubLink || !version) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing GitHub link or version number" })
        };
    }

    // Extract repository name from GitHub link
    const repoNameMatch = githubLink.match(/\/([^\/]+\/[^\/]+)$/);
    if (!repoNameMatch) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid GitHub link format" })
        };
    }

    const repoName = repoNameMatch[1];
    console.log("link = ", githubLink);
    console.log("repo = ", repoName);

    // Determine S3 bucket and key structure
    const s3BucketName = 'packages-registry-27';
    const zipFileName = `${repoName}-${version}.zip`;
    const s3Key = `${repoName}/${version}/${zipFileName}`;

    try {
        // Retrieve GitHub token from Secrets Manager
        const githubToken = await getSecret('GITHUB_TOKEN');

        // Download the GitHub package as a zip file
        const zipFile = await downloadGitHubRepoAsZip(githubLink, version, githubToken);

        // Upload the zip file to S3 with the original name
        await s3.putObject({
            Bucket: s3BucketName,
            Key: s3Key,
            Body: zipFile,
            ContentType: 'application/zip'
        }).promise();

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Package uploaded successfully",
                s3Key: s3Key
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Failed to upload package",
                details: error.message
            })
        };
    }
};

// Helper function to download a GitHub repository as a zip with token authentication
// Helper function to download a GitHub repository as a zip with token authentication
async function downloadGitHubRepoAsZip(githubLink, version, githubToken) {
    return new Promise((resolve, reject) => {
        // Construct the URL to download the repository as a zip archive
        const repoNameMatch = githubLink.match(/github\.com\/([^\/]+\/[^\/]+)$/);
        if (!repoNameMatch) {
            return reject(new Error("Invalid GitHub link format"));
        }

        const repoName = repoNameMatch[1];
        const downloadUrl = `https://api.github.com/repos/${repoName}/zipball/${version}`;

        // Set up the options for the HTTPS request with the authorization header
        const options = {
            headers: {
                'Authorization': `token ${githubToken}`,
                'User-Agent': 'AWS-Lambda-Function'
            }
        };

        // Make the HTTPS request to download the zip file
        https.get(downloadUrl, options, (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`Failed to download repository: ${response.statusCode} ${response.statusMessage}`));
            }

            // Accumulate the response data (zip file)
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const zipFile = Buffer.concat(chunks); // Combine all chunks into a single buffer
                resolve(zipFile);
            });
        }).on('error', (error) => {
            reject(new Error(`HTTPS request failed: ${error.message}`));
        });
    });
}


// Helper function to retrieve the GitHub token from Secrets Manager
async function getSecret(secretName) {
    try {
        const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
        if (data && 'SecretString' in data) {
            return data.SecretString;  // Return as a string
        } else {
            throw new Error("Secret not found or empty");
        }
    } catch (error) {
        console.error(`Error retrieving secret ${secretName}:`, error);
        throw new Error(`Failed to retrieve secret: ${error.message}`);
    }
}

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