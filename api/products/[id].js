const { handleRequest } = require("../../catalog-server.cjs");

module.exports = async function handler(request, response) {
  await handleRequest(request, response);
};
