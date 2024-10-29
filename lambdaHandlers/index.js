const { updateHandler } = require("./updateHandler");

exports.handler =async function name(event) {  //Basic handler function, serves as a Lambda functions main.
    
    /*
    if (event.body && event.body !== "") {
        const body = JSON.parse(event.body);
    }
    else{
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                message: 'No body provided in JSON file' }),
        };
    }
        */
    
    const body = JSON.parse(event.body);
    //Log body and funct
    console.log(body);
    const funct = body.funct;
    console.log(funct);

    if (funct == 1){
        return(uploadHandler(body));
    }
    else{
        return(updateHandler(body));
    }
}