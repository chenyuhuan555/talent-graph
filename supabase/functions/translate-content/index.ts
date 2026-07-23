import { createClient } from '@supabase/supabase-js';

import {
  buildTranslationPrompt,
  cleanTranslationOutput,
  fieldForContentType,
  TARGET_LANGUAGE,
  translateItems,
  TRANSLATABLE_ORG_TYPES,
  validateRequest,
  type ContentType,
  type SourceRecord,
  type TranslationDeps,
  type ValidItem,
} from '../_shared/translation.ts';


const LOCAL_ORIGIN = 'http://localhost:3000';
const MAX_BODY_BYTES = 32 * 1024;
// Only these roles may edit factual tables (organizations, papers) under the
// existing RLS. Translation writes name_zh / title_zh, so the same gate applies.
const ALLOWED_ROLES = new Set(['admin', 'operator']);
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MODEL_TIMEOUT_MS = 15_000;

function allowedOrigins(): Set<string> {
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([LOCAL_ORIGIN, ...configured]);
}

function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Vary': 'Origin',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

async function callDeepSeek(
  apiKey: string,
  model: string,
  contentType: ContentType,
  sourceText: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: buildTranslationPrompt(contentType) },
          { role: 'user', content: sourceText },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Do not surface response body / headers to the caller.
      throw new Error(`model_http_error_${response.status}`);
    }
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? '';
    return cleanTranslationOutput(content);
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse({ error: '不允许的请求来源' }, 403, null);
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: '仅支持 POST 请求' }, 405, origin);
  }

  const contentLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: '请求内容过大' }, 413, origin);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return jsonResponse({ error: '未登录或登录已失效' }, 401, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const secretKey = Deno.env.get('SUPABASE_SECRET_KEY')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return jsonResponse({ error: '服务暂不可用' }, 503, origin);
  }

  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonResponse({ error: '未登录或登录已失效' }, 401, origin);
  }
  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role,status')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileError || !callerProfile) {
    return jsonResponse({ error: '无权执行此操作' }, 403, origin);
  }
  if (!ALLOWED_ROLES.has(callerProfile.role) || callerProfile.status !== 'active') {
    return jsonResponse({ error: '无权执行此操作' }, 403, origin);
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return jsonResponse({ error: '请求无效' }, 400, origin);
  }
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: '请求内容过大' }, 413, origin);
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ error: '请求无效' }, 400, origin);
  }
  const validation = validateRequest(body);
  if (validation.error || !validation.items) {
    return jsonResponse({ error: validation.error ?? '请求无效' }, 422, origin);
  }

  const apiKey = Deno.env.get('DEEPSEEK_API_KEY') ?? '';
  const model = Deno.env.get('DEEPSEEK_MODEL') ?? 'deepseek-chat';

  const deps: TranslationDeps = {
    async readSource(item: ValidItem): Promise<SourceRecord | null> {
      if (item.content_type === 'organization') {
        const { data, error } = await adminClient
          .from('organizations')
          .select('name,organization_type,deleted_at')
          .eq('id', item.id)
          .maybeSingle();
        if (error || !data || data.deleted_at) return null;
        const skip = !TRANSLATABLE_ORG_TYPES.has(data.organization_type);
        return { text: data.name ?? null, skip };
      }
      const { data, error } = await adminClient
        .from('papers')
        .select('title')
        .eq('id', item.id)
        .maybeSingle();
      if (error || !data) return null;
      return { text: data.title ?? null, skip: false };
    },

    async readCache(contentType, sourceText) {
      const { data, error } = await adminClient
        .from('translation_cache')
        .select('status,translated_text')
        .eq('content_type', contentType)
        .eq('source_text', sourceText)
        .eq('target_language', TARGET_LANGUAGE)
        .maybeSingle();
      if (error || !data) return null;
      return { status: data.status, translated_text: data.translated_text };
    },

    async callModel(contentType, sourceText) {
      if (!apiKey) throw new Error('model_not_configured');
      return callDeepSeek(apiKey, model, contentType, sourceText);
    },

    async writeCache(row) {
      await adminClient
        .from('translation_cache')
        .upsert({
          content_type: row.contentType,
          source_text: row.sourceText,
          target_language: TARGET_LANGUAGE,
          translated_text: row.translatedText,
          status: row.status,
          last_error: row.error ?? null,
          translated_at: row.status === 'completed' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'content_type,source_text,target_language' });
    },

    async writeTarget(item, translatedText) {
      const table = item.content_type === 'organization' ? 'organizations' : 'papers';
      const field = fieldForContentType(item.content_type);
      await adminClient
        .from(table)
        .update({ [field]: translatedText })
        .eq('id', item.id);
    },
  };

  const results = await translateItems(validation.items, deps);
  return jsonResponse({ items: results }, 200, origin);
});
