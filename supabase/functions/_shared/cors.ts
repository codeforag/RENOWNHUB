// CORS shared helpers for Supabase Edge Functions.
// Restrict to known production + dev origins (defense in depth).

const ALLOWED_ORIGINS = [
  'https://mallucupid.com',
  'https://www.mallucupid.com',
  'https://renownhub.bzeadecommerce.workers.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export const corsHeaders = (origin?: string | null) => {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, PATCH, DELETE',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
};

export function handleCors(req: Request): Response | null {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }
  return null;
}

export function jsonBody(data: unknown, status = 200, origin?: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

/**
 * Wrap a Deno.serve handler with CORS + JSON error handling.
 * Always returns a structured { error, code, hint } shape on failure.
 */
export function withHandler(
  fn: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const origin = req.headers.get('Origin');
    const corsResp = handleCors(req);
    if (corsResp) return corsResp;
    try {
      return await fn(req);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Unhandled error:', msg, err instanceof Error ? err.stack : err);
      return jsonBody(
        { error: `Server error: ${msg}. Please retry; if it persists, contact support with this message.`, code: 'internal_error' },
        500,
        origin
      );
    }
  };
}
