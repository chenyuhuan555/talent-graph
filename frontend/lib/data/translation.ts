import { requireData } from './errors';
import { defaultClient, type DataClient } from './shared';

// Client-side helper for requesting asynchronous name translation. The browser
// never talks to DeepSeek directly; it only invokes the authenticated
// `translate-content` Edge Function, which holds the DEEPSEEK_API_KEY as a
// server-side secret and re-reads the authoritative source text from the
// database. The caller MUST NOT rely on the result to render immediately — the
// UI should keep showing the original text and re-fetch the record later.

export type TranslatableContentType = 'organization' | 'paper';

export interface TranslateRequestItem {
  content_type: TranslatableContentType;
  id: string;
}

export interface TranslateResultItem {
  id: string;
  content_type: TranslatableContentType;
  status: 'completed' | 'failed' | 'skipped';
  translated_text?: string;
  error?: string;
}

// Requests translation for up to 20 records. Errors are intentionally swallowed
// so a translation failure can never break the primary create/update flow — the
// original text remains as the fallback. Returns null when the call fails.
export async function requestTranslation(
  items: TranslateRequestItem[],
  client: DataClient = defaultClient(),
): Promise<TranslateResultItem[] | null> {
  if (items.length === 0) return [];
  try {
    const payload = await requireData(
      await client.functions.invoke('translate-content', { body: { items } }),
    ) as { items?: TranslateResultItem[] };
    return payload.items ?? [];
  } catch {
    // Non-blocking: translation is best-effort and must not surface as an error.
    return null;
  }
}

// Fire-and-forget translation for a single organization record, to be called
// after a successful create/update of organizations.name. Never throws.
export function translateOrganization(id: string, client: DataClient = defaultClient()): void {
  void requestTranslation([{ content_type: 'organization', id }], client);
}

// Fire-and-forget translation for a single paper record, to be called after a
// successful create/update of papers.title. Never throws.
export function translatePaper(id: string, client: DataClient = defaultClient()): void {
  void requestTranslation([{ content_type: 'paper', id }], client);
}
