const INTERNAL_EMAIL_SUFFIX = '@talent-graph.invalid';

export function normalizeUsername(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

export async function usernameToInternalEmail(value: string): Promise<string> {
  const normalized = normalizeUsername(value);
  if (!normalized) throw new Error('用户名不能为空');

  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
  return `${hex}${INTERNAL_EMAIL_SUFFIX}`;
}
