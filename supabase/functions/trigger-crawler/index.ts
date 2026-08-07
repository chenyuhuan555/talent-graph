import { createClient } from '@supabase/supabase-js';

import { validateCrawlerRequest, workflowDispatchPayload } from '../_shared/crawler.ts';

const LOCAL_ORIGIN = 'http://localhost:3000';
const REPOSITORY = 'chenyuhuan555/talent-graph';
const WORKFLOW = 'crawler.yml';

function allowedOrigins(): Set<string> {
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  return new Set([LOCAL_ORIGIN, ...configured]);
}

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    Vary: 'Origin',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins().has(origin)) return jsonResponse({ error: '不允许的请求来源' }, 403, null);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'POST') return jsonResponse({ error: '仅支持 POST 请求' }, 405, origin);

  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return jsonResponse({ error: '未登录或登录已失效' }, 401, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const githubToken = Deno.env.get('GITHUB_ACTIONS_TOKEN') ?? '';
  if (!supabaseUrl || !publishableKey || !githubToken) return jsonResponse({ error: '服务暂不可用' }, 503, origin);

  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !userData.user) return jsonResponse({ error: '未登录或登录已失效' }, 401, origin);

  const { data: profile, error: profileError } = await callerClient
    .from('profiles').select('role,status').eq('id', userData.user.id).maybeSingle();
  if (profileError || !profile || profile.role !== 'admin' || profile.status !== 'active') {
    return jsonResponse({ error: '只有管理员可以启动采集' }, 403, origin);
  }

  let body: unknown = {};
  try { body = await request.json(); } catch { return jsonResponse({ error: '请求无效' }, 400, origin); }
  const validation = validateCrawlerRequest(body);
  if (validation.error || !validation.value) return jsonResponse({ error: validation.error ?? '请求无效' }, 422, origin);

  const dispatch = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(workflowDispatchPayload(validation.value)),
  });
  if (!dispatch.ok) return jsonResponse({ error: '无法启动后台采集任务' }, 502, origin);
  return jsonResponse({ status: 'queued', max: validation.value.max }, 202, origin);
});
