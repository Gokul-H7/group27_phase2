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
function downloadGitHubRepoAsZip(githubLink, version, githubToken, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const repoUrl = `${githubLink}/archive/refs/tags/${version}.zip`;
        
        // Limit the number of redirects to prevent an infinite loop
        if (redirectCount > 5) {
            return reject(new Error("Too many redirects"));
        }

        const options = {
            headers: {
                'Authorization': `token ${githubToken}`,
                'User-Agent': 'AWS-Lambda-Downloader'
            }
        };

        https.get(repoUrl, options, (response) => {
            if (response.statusCode === 302 && response.headers.location) {
                // Follow the redirect
                console.log(`Redirecting to ${response.headers.location}`);
                downloadGitHubRepoAsZip(response.headers.location, version, githubToken, redirectCount + 1)
                    .then(resolve)
                    .catch(reject);
            } else if (response.statusCode === 200) {
                // Successful response, collect data
                const data = [];
                response.on('data', chunk => data.push(chunk));
                response.on('end', () => resolve(Buffer.concat(data)));
            } else if (response.statusCode === 404) {
                reject(new Error(`GitHub repository or version not found at ${repoUrl}`));
            } else {
                reject(new Error(`Failed to download file, status code: ${response.statusCode}`));
            }
        }).on('error', (error) => reject(error));
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