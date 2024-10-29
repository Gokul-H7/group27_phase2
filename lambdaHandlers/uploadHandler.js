const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.uploadHandler = async (body) => {
    const { packageName, version, fileContent } = body;
    const key = "packages/" + packageName + "/" + version + "/package.zip";

    const params = {
        Bucket: 'packages-registry-27',  // Replace with your bucket name
        Key: key,
        Body: Buffer.from(fileContent, 'base64'),  // Assuming base64 encoded content
        ContentType: 'application/zip',
    };

    try {
        await s3.putObject(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Package uploaded successfully!' }),
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};