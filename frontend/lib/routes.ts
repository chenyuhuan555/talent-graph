export function personDetailHref(id: string): string {
  return `/persons/detail?id=${encodeURIComponent(id)}`;
}

export function externalHttpHref(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
