const AWS = require('aws-sdk');
const lambda = new AWS.Lambda({ region: 'us-east-2' });

test('Lambda function should return status code 200', async () => {
  const params = {
    FunctionName: 'LambdaHandlers', // Replace with your Lambda function name
    Payload: JSON.stringify({ name: 'ACME Corp' }) // Modify if your Lambda function expects different input
  };

  const result = await lambda.invoke(params).promise();
  const payload = JSON.parse(result.Payload);

  expect(payload.statusCode).toBe(200);
});