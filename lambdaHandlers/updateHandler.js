exports.updateHandler = async (body) => {
    // Log the received event for debugging

    // Extracting param`eters from the event

    console.log("Hello");
    const name = body.name || "World";
    console.log(name);

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