const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const BUCKET_NAME = 'packages-registry-27';
const TABLE_NAME = 'PackagesTable'; 

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event));

    const { path, httpMethod } = event;

    if (httpMethod === 'POST') {
        if (path === '/package') {
            return handleUploadPackage(event); // Upload functionality
        } else if (path === '/packages') {
            return handleQueryPackages(event); // Query functionality
        }
    }

    return generateResponse(405, 'Method Not Allowed');
};

const handleUploadPackage = async (event) => {
    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (error) {
        console.error('Error parsing JSON:', error);
        return generateResponse(400, 'Invalid JSON in request body.');
    }

    const { Name, Version, Content, JSProgram, URL, debloat } = requestBody;

    if (!Name || !Version) {
        return generateResponse(400, '"Name" and "Version" are required.');
    }
    if ((!Content && !URL) || (Content && URL)) {
        return generateResponse(400, 'Provide either "Content" or "URL", not both.');
    }

    const packageId = `${Name}-${Version}`;

    if (Content) {
        try {
            await s3
                .putObject({
                    Bucket: BUCKET_NAME,
                    Key: `packages/${packageId}.zip`,
                    Body: Buffer.from(Content, 'base64'),
                })
                .promise();
        } catch (error) {
            console.error('Error uploading to S3:', error);
            return generateResponse(500, 'Failed to upload content.');
        }
    }

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
    } catch (error) {
        console.error('Error writing to DynamoDB:', error);
        return generateResponse(500, 'Failed to store package metadata.');
    }

    return generateResponse(201, {
        metadata: {
            Name,
            Version,
            ID: packageId,
        },
        data: {
            Content: Content ? '[Stored in S3]' : null,
            URL: URL || null,
            JSProgram,
        },
    });
};

const handleQueryPackages = async (event) => {
    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (error) {
        console.error('Error parsing JSON:', error);
        return generateResponse(400, 'Invalid JSON in request body.');
    }

    if (!Array.isArray(requestBody)) {
        return generateResponse(400, 'Request body must be an array.');
    }

    const queries = requestBody.map((query) => {
        const { Name, Version } = query;

        if (!Name || !Version) {
            throw new Error('"Name" and "Version" are required in each query.');
        }

        return {
            TableName: TABLE_NAME,
            FilterExpression: 'Name = :name AND contains(Version, :version)',
            ExpressionAttributeValues: {
                ':name': Name,
                ':version': Version,
            },
        };
    });

    try {
        const results = await Promise.all(
            queries.map((queryParams) => dynamodb.scan(queryParams).promise())
        );
        const packages = results.flatMap((result) => result.Items);

        return generateResponse(200, packages);
    } catch (error) {
        console.error('Error querying packages:', error);
        return generateResponse(500, 'Failed to query packages.');
    }
};

function generateResponse(statusCode, body) {
    return {
        statusCode,
        body: JSON.stringify(typeof body === 'object' ? body : { message: body }),
        headers: {
            'Content-Type': 'application/json',
        },
    };
}
