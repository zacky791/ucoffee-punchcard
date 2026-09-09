const path = require('path');

// Fallback if Netlify UI env vars did not inject into the Function runtime.
// Prefer real process.env when present.
(function ensureSupabaseEnv() {
  const env = process.env;
  if (!env['SUPABASE_URL'] && !env['VITE_SUPABASE_URL']) {
    env['SUPABASE_URL'] = 'https://vpqsmvxcssyqrfsfvcrt.supabase.co';
  }
  if (
    !env['SUPABASE_ANON_KEY'] &&
    !env['SUPABASE_PUBLISHABLE_KEY'] &&
    !env['VITE_SUPABASE_ANON_KEY'] &&
    !env['VITE_SUPABASE_PUBLISHABLE_KEY']
  ) {
    env['SUPABASE_ANON_KEY'] =
      'sb_publishable_qwE681JAEkSjQQIAkhFnpA_leV6OQzE';
  }
})();

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
