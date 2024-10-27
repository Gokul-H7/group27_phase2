const { updateHandler } = require("./updateHandler");

exports.handler =async function name(event) {  //Basic handler function, serves as a Lambda functions main.
    if (event.funct == 1){
        return(uploadHandler(event));
    }
    else{
        return(updateHandler(event));
    }
}