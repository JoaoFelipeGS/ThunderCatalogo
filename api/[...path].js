const { handleRequest } = require("../server");

module.exports = async function handler(request, response) {
  await handleRequest(request, response);
};
