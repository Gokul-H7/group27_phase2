const AWS = require('aws-sdk');
const https = require('https');
const s3 = new AWS.S3();
const secretsManager = new AWS.SecretsManager();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    const { Name, Version, URL, Content, JSProgram, debloat = false } = event;

    // Validate mandatory inputs
    if (!Name || !Version || !JSProgram) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing required fields: Name, Version, or JSProgram" })
        };
    }

    if (URL && Content) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Both URL and Content cannot be provided at the same time. Provide only one." })
        };
    }

    if (!URL && !Content) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Either URL or Content must be provided" })
        };
    }

    const PackageID = `${Name}-${Version}`;
    const s3BucketName = 'packages-registry-27';
    const s3Key = `${Name}/${Version}/${PackageID}.zip`;

    let metadata = {
        Name,
        Version,
        ID: PackageID.toLowerCase()
    };

    try {
        if (URL) {
            const githubToken = await getSecret('GITHUB_TOKEN_2');
            const { base64Content, s3Response } = await processURLToS3(URL, githubToken, s3BucketName, s3Key);
            await updateDynamoDB(PackageID, Version, metadata, s3Key);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    metadata,
                    data: { URL, Content: base64Content, JSProgram }
                })
            };
        } else if (Content) {
            const contentBuffer = Buffer.from(Content, 'base64');
            await uploadContentToS3(contentBuffer, s3BucketName, s3Key);
            await updateDynamoDB(PackageID, Version, metadata, s3Key);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    metadata,
                    data: { Content, JSProgram }
                })
            };
        }
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Failed to process package",
                details: error.message
            })
        };
    }
};

// Helper function to process URL, download the content, and upload it to S3
async function processURLToS3(githubLink, githubToken, s3BucketName, s3Key) {
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
async function updateDynamoDB(PackageID, Version, metadata, s3Key) {
    const params = {
        TableName: 'Packages',
        Item: {
            PackageID,
            Version,
            Name: metadata.Name,
            Metadata: metadata,
            S3Key: s3Key
        }
    };

    return dynamoDB.put(params).promise();
}
