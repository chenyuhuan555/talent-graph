export type CrawlerRequest = { max: number; keywords: string; domain?: string };

/** 允许的顶层领域（persons.industry 中文枚举，与 supabase 迁移及前端 domains.ts 保持一致） */
export const ALLOWED_DOMAINS = [
  '人工智能', '量子计算', '生物医药', '具身智能', '核聚变', '新能源', '交叉领域',
];

export function validateCrawlerRequest(body: unknown): { error?: string; value?: CrawlerRequest } {
  if (body == null || typeof body !== 'object') return { error: '请求无效' };
  const raw = body as { max?: unknown; keywords?: unknown; domain?: unknown };
  const max = raw.max == null ? 10 : raw.max;
  if (!Number.isInteger(max) || Number(max) < 1 || Number(max) > 600) {
    return { error: 'max 必须是 1–600 的整数' };
  }
  if (raw.keywords != null && (typeof raw.keywords !== 'string' || raw.keywords.length > 1000)) {
    return { error: 'keywords 格式无效' };
  }
  if (raw.domain != null && (typeof raw.domain !== 'string' || !ALLOWED_DOMAINS.includes(raw.domain))) {
    return { error: 'domain 必须是支持的领域' };
  }
  const domain = typeof raw.domain === 'string' ? raw.domain : '';
  return {
    value: {
      max: Number(max),
      keywords: typeof raw.keywords === 'string' ? raw.keywords.trim() : '',
      domain,
    },
  };
}

export function workflowDispatchPayload(request: CrawlerRequest): {
  ref: 'main';
  inputs: { max: string; keywords: string; domain: string };
} {
  return {
    ref: 'main',
    inputs: {
      max: String(request.max),
      keywords: request.keywords,
      domain: request.domain ?? '',
    },
  };
}
