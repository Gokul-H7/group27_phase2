const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const BUCKET_NAME = 'packages-registry-27';
const TABLE_NAME = 'PackagesTable';

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event));

    // Step 1: Validate the request
    if (!event.body) {
        return generateResponse(400, 'Invalid request. Missing body.');
    }

    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (error) {
        console.error('Error parsing JSON:', error);
        return generateResponse(400, 'Invalid JSON in request body.');
    }

    const { Name, Version, Content, JSProgram, URL, debloat } = requestBody;

    // Step 2: Validate required fields
    if (!Name || !Version) {
        return generateResponse(400, 'Invalid request. "Name" and "Version" are required.');
    }
    if ((!Content && !URL) || (Content && URL)) {
        return generateResponse(400, 'Invalid request. Provide either "Content" or "URL", but not both.');
    }

    // Step 3: Generate a package ID (Name + Version)
    const packageId = `${Name}-${Version}`;
    const packageMetadata = {
        Name,
        Version,
        ID: packageId,
    };

    // Step 4: Handle content upload (if applicable)
    if (Content) {
        try {
            await s3
                .putObject({
                    Bucket: BUCKET_NAME,
                    Key: `packages/${packageId}.zip`,
                    Body: Buffer.from(Content, 'base64'),
                })
                .promise();
            console.log('Content uploaded to S3.');
        } catch (error) {
            console.error('Error uploading to S3:', error);
            return generateResponse(500, 'Failed to upload content.');
        }
    }

    // Step 5: Store metadata in DynamoDB
    const metadata = {
        PackageID: packageId,
        Name,
        Version,
        Timestamp: new Date().toISOString(),
        ContentStoredInS3: !!Content,
        URL,
        JSProgram,
        Debloat: debloat,
    };

    try {
        await dynamodb
            .put({
                TableName: TABLE_NAME,
                Item: metadata,
            })
            .promise();
        console.log('Metadata stored in DynamoDB:', metadata);
    } catch (error) {
        console.error('Error writing to DynamoDB:', error);
        return generateResponse(500, 'Failed to store package metadata.');
    }

    // Step 6: Create the response payload
    const responsePayload = {
        metadata: packageMetadata,
        data: {
            Content: Content ? '[Stored in S3]' : null,
            URL: URL || null,
            JSProgram,
        },
    };

    // Remove the `URL` field from the response if the input was `Content`
    if (Content) {
        delete responsePayload.data.URL;
    }

    console.log('Returning success response:', responsePayload);
    return generateResponse(201, responsePayload);
};

// Utility function to generate a consistent HTTP response
function generateResponse(statusCode, body) {
    return {
        statusCode,
        body: JSON.stringify(typeof body === 'object' ? body : { message: body }),
        headers: {
            'Content-Type': 'application/json',
        },
    };
}
