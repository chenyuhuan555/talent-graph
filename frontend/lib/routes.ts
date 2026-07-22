export function personDetailHref(id: string): string {
  return `/persons/detail?id=${encodeURIComponent(id)}`;
}
