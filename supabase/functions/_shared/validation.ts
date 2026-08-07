// Shared server-side validation utilities.
// NEVER trust the frontend — every input is validated here.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/;

export interface ValidationError {
  field: string;
  message: string;
}

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && EMAIL_RE.test(email.toLowerCase());
}

export function isValidUsername(username: unknown): username is string {
  return typeof username === 'string' && USERNAME_RE.test(username.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Generate a cryptographically-secure 6-digit OTP. */
export function generateOTP(): string {
  const digits = new Uint32Array(6);
  crypto.getRandomValues(digits);
  return Array.from(digits, (d) => d % 10).join('');
}

/** Validate an Authorization: Bearer <token> header and return the user. */
export async function requireUser(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ user: any; error?: Response | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      user: null,
      error: jsonError('Missing or malformed Authorization header. Sign in and try again.', 401, req),
    };
  }
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return {
      user: null,
      error: jsonError('Empty auth token. Please sign in again.', 401, req),
    };
  }
  const { createClient } = await import('jsr:@supabase/supabase-js@2');
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return {
      user: null,
      error: jsonError('Your session has expired or is invalid. Please sign in again.', 401, req),
    };
  }
  return { user: data.user };
}

import { corsHeaders } from './cors.ts';

function jsonError(message: string, status: number, req: Request): Response {
  return new Response(
    JSON.stringify({ error: message, code: status === 401 ? 'unauthorized' : 'bad_request' }),
    {
      status,
      headers: { ...corsHeaders(req.headers.get('Origin')), 'Content-Type': 'application/json' },
    }
  );
}

/** Log an activity event for audit/security. Non-blocking, never throws. */
export async function logActivity(
  supabase: any,
  params: {
    user_id?: string | null;
    action: string;
    entity_type?: string;
    entity_id?: string;
    metadata?: Record<string, unknown>;
    req?: Request;
  }
): Promise<void> {
  try {
    const ip = params.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const ua = params.req?.headers.get('user-agent') || null;
    await supabase.from('activity_log').insert({
      user_id: params.user_id ?? null,
      action: params.action,
      entity_type: params.entity_type ?? null,
      entity_id: params.entity_id ?? null,
      ip_address: ip,
      user_agent: ua,
      metadata: params.metadata ?? {},
    });
  } catch (e) {
    console.warn('activity_log insert failed (non-fatal):', e);
  }
}
