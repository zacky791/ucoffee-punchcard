const path = require('path');
const serverless = require('serverless-http');

// Resolve Express/Supabase deps from the server package
module.paths.unshift(path.join(__dirname, '../../server/node_modules'));

const app = require('../../server/src/app');
const handler = serverless(app);

exports.handler = async (event, context) => {
  // Keep Express routes (/api/...) working under Netlify Functions
  const current = event.path || event.rawPath || '';
  if (current.startsWith('/.netlify/functions/api')) {
    const rest = current.slice('/.netlify/functions/api'.length);
    event.path = `/api${rest || ''}` || '/api';
  } else if (
    event.pathParameters &&
    event.pathParameters.splat != null &&
    !String(current).startsWith('/api')
  ) {
    const splat = Array.isArray(event.pathParameters.splat)
      ? event.pathParameters.splat.join('/')
      : String(event.pathParameters.splat);
    event.path = `/api/${splat}`.replace(/\/+$/, '') || '/api';
  }
  return handler(event, context);
};
