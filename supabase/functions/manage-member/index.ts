import { createClient } from '@supabase/supabase-js';

import {
  normalizeUsername,
  usernameToHash,
  usernameToInternalEmail,
} from '../_shared/username.ts';


const LOCAL_ORIGIN = 'http://localhost:3000';
const MAX_BODY_BYTES = 16 * 1024;
const ROLES = new Set(['admin', 'leader', 'consultant', 'operator']);
const ACTIONS = new Set(['create', 'disable', 'set_role']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MemberAction = 'create' | 'disable' | 'set_role';
type MemberRequest = {
  action?: MemberAction;
  userId?: string;
  username?: string;
  displayName?: string;
  role?: string;
  department?: string | null;
  password?: string;
};

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

function isText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function validateRequest(body: MemberRequest): string | null {
  if (!body.action || !ACTIONS.has(body.action)) return '请求无效';
  if (body.action === 'create') {
    if (!isText(body.username, 1, 64)) return '用户名格式无效';
    if (!isText(body.displayName, 1, 128)) return '姓名格式无效';
    if (!body.role || !ROLES.has(body.role)) return '角色无效';
    if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) {
      return '密码长度必须为 12–128 位';
    }
    if (body.department != null && !isText(body.department, 1, 128)) return '部门格式无效';
    if (normalizeUsername(body.username).length > 64) return '用户名格式无效';
  } else {
    if (!body.userId || !UUID_PATTERN.test(body.userId)) return '成员标识无效';
    if (body.action === 'set_role' && (!body.role || !ROLES.has(body.role))) return '角色无效';
  }
  return null;
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
  const callerId = userData.user.id;
  const { data: callerProfile, error: profileError } = await callerClient
    .from('profiles')
    .select('role,status')
    .eq('id', callerId)
    .maybeSingle();
  if (profileError || !callerProfile) {
    return jsonResponse({ error: '无权执行此操作' }, 403, origin);
  }
  if (callerProfile.role !== 'admin' || callerProfile.status !== 'active') {
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

  let body: MemberRequest;
  try {
    body = JSON.parse(bodyText) as MemberRequest;
  } catch {
    return jsonResponse({ error: '请求无效' }, 400, origin);
  }
  const validationError = validateRequest(body);
  if (validationError) return jsonResponse({ error: validationError }, 422, origin);

  if (body.action === 'create') {
    const usernameHash = await usernameToHash(body.username!);
    const internalEmail = await usernameToInternalEmail(body.username!);
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: internalEmail,
      password: body.password!,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return jsonResponse({ error: '用户名已存在或无法创建成员' }, 409, origin);
    }

    const profile = {
      id: created.user.id,
      username_hash: usernameHash,
      display_name: body.displayName!.trim(),
      role: body.role!,
      department: body.department?.trim() || null,
      status: 'active',
    };
    const { error: insertError } = await adminClient.from('profiles').insert(profile);
    if (insertError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: '用户名已存在或无法创建成员' }, 409, origin);
    }
    const { error: auditError } = await adminClient.from('audit_logs').insert({
      user_id: callerId,
      action: 'member_change',
      entity_type: 'profile',
      entity_id: created.user.id,
      after_data: JSON.stringify({ role: body.role, status: 'active' }),
    });
    if (auditError) {
      await adminClient.from('profiles').delete().eq('id', created.user.id);
      await adminClient.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: '服务暂不可用' }, 503, origin);
    }
    return jsonResponse({
      member: {
        id: profile.id,
        display_name: profile.display_name,
        role: profile.role,
        department: profile.department,
        status: profile.status,
      },
    }, 201, origin);
  }

  const targetId = body.userId!;
  if (targetId === callerId) {
    return jsonResponse({ error: '不能修改当前管理员账户' }, 409, origin);
  }
  const { data: targetProfile, error: targetError } = await adminClient
    .from('profiles')
    .select('id,role,status')
    .eq('id', targetId)
    .maybeSingle();
  if (targetError || !targetProfile) {
    return jsonResponse({ error: '成员不存在' }, 404, origin);
  }
  if (body.action === 'disable') {
    const { error: disableError } = await adminClient
      .from('profiles')
      .update({ status: 'disabled', updated_at: new Date().toISOString() })
      .eq('id', targetId);
    if (disableError) return jsonResponse({ error: '无法更新成员' }, 409, origin);
    const { error: auditError } = await adminClient.from('audit_logs').insert({
      user_id: callerId,
      action: 'member_change',
      entity_type: 'profile',
      entity_id: targetId,
      after_data: JSON.stringify({ status: 'disabled' }),
    });
    if (auditError) {
      await adminClient.from('profiles').update({
        status: targetProfile.status,
        updated_at: new Date().toISOString(),
      }).eq('id', targetId);
      return jsonResponse({ error: '服务暂不可用' }, 503, origin);
    }
    await adminClient.auth.admin.updateUserById(targetId, { ban_duration: '876000h' });
    return jsonResponse({ member: { id: targetId, status: 'disabled' } }, 200, origin);
  }

  const { error: roleError } = await adminClient
    .from('profiles')
    .update({ role: body.role!, updated_at: new Date().toISOString() })
    .eq('id', targetId);
  if (roleError) return jsonResponse({ error: '无法更新成员' }, 409, origin);
  const { error: auditError } = await adminClient.from('audit_logs').insert({
    user_id: callerId,
    action: 'member_change',
    entity_type: 'profile',
    entity_id: targetId,
    after_data: JSON.stringify({ role: body.role }),
  });
  if (auditError) {
    await adminClient.from('profiles').update({
      role: targetProfile.role,
      updated_at: new Date().toISOString(),
    }).eq('id', targetId);
    return jsonResponse({ error: '服务暂不可用' }, 503, origin);
  }
  return jsonResponse({ member: { id: targetId, role: body.role } }, 200, origin);
});
