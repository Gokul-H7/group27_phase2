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
    const s3Key = `${repoName}/${version}/`;

    try {
        // Retrieve GitHub token from Secrets Manager
        const githubToken = await getSecret('GITHUB_TOKEN_2');

        // Stream the GitHub package directly to S3
        const s3Response = await streamToS3(githubLink, githubToken, s3BucketName, s3Key);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Package uploaded successfully",
                s3Key: s3Response.Key
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

// Helper function to stream a GitHub repository zip file directly to S3
async function streamToS3(githubLink, githubToken, s3BucketName, s3Key) {
    return new Promise((resolve, reject) => {
        const repoNameMatch = githubLink.match(/github\.com\/([^\/]+\/[^\/]+)$/);
        if (!repoNameMatch) return reject(new Error("Invalid GitHub link format"));
        const repoName = repoNameMatch[1];
        const downloadUrl = `https://api.github.com/repos/${repoName}/zipball`;

        console.log("Download URL:", downloadUrl);

        const options = {
            headers: {
                'Authorization': `token ${githubToken}`,
                'User-Agent': 'AWS-Lambda-Function'
            }
        };

        // Primary request to downloadUrl
        https.get(downloadUrl, options, (response) => {
            if (response.statusCode === 302 && response.headers.location) {
                console.log("Received redirect, following to:", response.headers.location);
                
                // Follow the redirect
                https.get(response.headers.location, options, (redirectedResponse) => {
                    if (redirectedResponse.statusCode !== 200) {
                        return reject(new Error(`Failed to download repository after redirect: ${redirectedResponse.statusCode} ${redirectedResponse.statusMessage}`));
                    }

                    console.log("Started streaming download from GitHub to S3 after redirect...");

                    const uploadParams = {
                        Bucket: s3BucketName,
                        Key: s3Key,
                        Body: redirectedResponse,
                        ContentType: 'application/zip'
                    };

                    s3.upload(uploadParams, (err, data) => {
                        if (err) {
                            console.error("S3 upload failed:", err);
                            reject(new Error(`S3 upload failed: ${err.message}`));
                        } else {
                            console.log("S3 upload successful:", data);
                            resolve(data);
                        }
                    });
                }).on('error', (error) => {
                    console.error("HTTPS redirect request failed:", error);
                    reject(new Error(`HTTPS redirect request failed: ${error.message}`));
                });
            } else if (response.statusCode === 200) {
                console.log("Started streaming download from GitHub to S3...");

                const uploadParams = {
                    Bucket: s3BucketName,
                    Key: s3Key,
                    Body: response,
                    ContentType: 'application/zip'
                };

                s3.upload(uploadParams, (err, data) => {
                    if (err) {
                        console.error("S3 upload failed:", err);
                        reject(new Error(`S3 upload failed: ${err.message}`));
                    } else {
                        console.log("S3 upload successful:", data);
                        resolve(data);
                    }
                });
            } else {
                console.error(`Failed to download repository: ${response.statusCode} ${response.statusMessage}`);
                reject(new Error(`Failed to download repository: ${response.statusCode} ${response.statusMessage}`));
            }
        }).on('error', (error) => {
            console.error("HTTPS request failed:", error);
            reject(new Error(`HTTPS request failed: ${error.message}`));
        });
    });
}


// Helper function to retrieve the GitHub token from Secrets Manager
async function getSecret(secretName) {
    try {
        const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
        if (data && 'SecretString' in data) {
            const secret = JSON.parse(data.SecretString);
            return secret.GITHUB_TOKEN_2;
        } else {
            throw new Error("Secret not found or empty");
        }
    } catch (error) {
        console.error(`Error retrieving secret ${secretName}:`, error);
        throw new Error(`Failed to retrieve secret: ${error.message}`);
    }
}
