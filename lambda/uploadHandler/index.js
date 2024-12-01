const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const BUCKET_NAME = 'your-bucket-name'; // Replace with your S3 bucket name
const TABLE_NAME = 'PackagesTable'; // Replace with your DynamoDB table name

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

    const { Content, JSProgram, URL, debloat } = requestBody;

    // Step 2: Validate required fields
    if ((!Content && !JSProgram && !URL) || (Content && URL)) {
        return generateResponse(400, 'Invalid request. Provide either "Content" or "URL", but not both.');
    }

    // Step 3: Generate a unique package ID
    const packageId = generatePackageId(requestBody);

    // Step 4: Upload content to S3 (if applicable)
    if (Content) {
        try {
            await s3
                .putObject({
                    Bucket: BUCKET_NAME,
                    Key: `packages/${packageId}.zip`,
                    Body: Buffer.from(Content, 'base64'),
                })
                .promise();
            console.log('Package content uploaded to S3.');
        } catch (error) {
            console.error('Error uploading to S3:', error);
            return generateResponse(500, 'Failed to upload package content.');
        }
    }

    // Step 5: Store metadata in DynamoDB
    const metadata = {
        PackageID: packageId,
        Name: 'Example Package', // Replace with actual logic
        Version: '1.0.0', // Replace with actual logic
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
        metadata: {
            Name: metadata.Name,
            Version: metadata.Version,
            ID: metadata.PackageID,
        },
        data: {
            Content: Content ? '[Stored in S3]' : null,
            URL,
            JSProgram,
        },
    };

    console.log('Returning success response:', responsePayload);
    return generateResponse(201, responsePayload);
};

// Generate a unique package ID based on input (mock logic)
function generatePackageId(requestBody) {
    const timestamp = Date.now();
    return `pkg-${timestamp}`;
}

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
