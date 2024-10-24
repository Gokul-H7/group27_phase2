exports.updateHandler = async (event) => {
    // Log the received event for debugging
    console.log("Received event:", JSON.stringify(event, null, 2));

    // Extracting param`eters from the event
    const name = event.name || "test";

    // Simple response
    const response = {
        statusCode: 200,
        body: JSON.stringify({
            message: `Hello, ${name}! This is a test Lambda function.`,
        }),
    };

    // Return the response
    return response;
};