const path = require('path');
const serverless = require('serverless-http');

// Resolve Express/Supabase deps from the server package
module.paths.unshift(path.join(__dirname, '../../server/node_modules'));

const app = require('../../server/src/app');

exports.handler = serverless(app);
