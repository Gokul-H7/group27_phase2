const { updateHandler } = require("./updateHandler");

exports.handler =async function name(event) {  //Basic handler function, serves as a Lambda functions main.
    /*
    if (event.body && event.body !== "") {
        var body = JSON.parse(event.body);
    }
    */

    if (event.body.funct == 1){
        return(uploadHandler(event));
    }
    else{
        return(updateHandler(event));
    }
}