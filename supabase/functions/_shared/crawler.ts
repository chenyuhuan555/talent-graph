export type CrawlerRequest = { max: number; keywords: string };

export function validateCrawlerRequest(body: unknown): { error?: string; value?: CrawlerRequest } {
  if (body == null || typeof body !== 'object') return { error: '请求无效' };
  const raw = body as { max?: unknown; keywords?: unknown };
  const max = raw.max == null ? 10 : raw.max;
  if (!Number.isInteger(max) || Number(max) < 1 || Number(max) > 600) {
    return { error: 'max 必须是 1–600 的整数' };
  }
  if (raw.keywords != null && (typeof raw.keywords !== 'string' || raw.keywords.length > 1000)) {
    return { error: 'keywords 格式无效' };
  }
  return { value: { max: Number(max), keywords: typeof raw.keywords === 'string' ? raw.keywords.trim() : '' } };
}

export function workflowDispatchPayload(request: CrawlerRequest): {
  ref: 'main';
  inputs: { max: string; keywords: string };
} {
  return { ref: 'main', inputs: { max: String(request.max), keywords: request.keywords } };
}
