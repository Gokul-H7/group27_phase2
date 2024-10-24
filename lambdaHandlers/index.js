const { updateHandler } = require("./updateHandler");

exports.handler =async function name(event) {
    return(updateHandler(event));
}