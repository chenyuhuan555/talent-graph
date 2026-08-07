// Pure translation logic shared by the translate-content Edge Function.
//
// This module deliberately contains no Deno- or npm-specific imports so that it
// can be unit tested with the frontend vitest runner. All side effects
// (database reads/writes, DeepSeek calls) are injected through the
// TranslationDeps interface, keeping the ordered per-item flow fully testable.

export type ContentType = 'organization' | 'paper';

export interface TranslateItemInput {
  content_type?: unknown;
  id?: unknown;
  // source_text from the client is intentionally ignored; the server re-reads
  // the authoritative original text from the database using the id.
  source_text?: unknown;
}

export interface ValidItem {
  content_type: ContentType;
  id: string;
}

export type ItemStatus = 'completed' | 'failed' | 'skipped';

export interface TranslateItemResult {
  id: string;
  content_type: ContentType;
  status: ItemStatus;
  translated_text?: string;
  error?: string;
}

export const MAX_ITEMS = 20;
export const MAX_TEXT_LENGTH = 1000;
export const TARGET_LANGUAGE = 'zh-CN';

// Only schools and companies are translated. Other organization types (labs,
// institutes, teams, …) are skipped without contacting DeepSeek.
export const TRANSLATABLE_ORG_TYPES = new Set([
  'university',
  'company',
  'school',
  'college',
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// A string is treated as already-Chinese (and therefore returned as-is without
// billing DeepSeek) when it contains at least one CJK ideograph and no ASCII
// letters. Mixed strings such as "OpenAI 公司" are still sent for translation.
export function isProbablyChinese(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const hasCjk = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(trimmed);
  const hasLatin = /[A-Za-z]/.test(trimmed);
  return hasCjk && !hasLatin;
}

// Strips markdown fences, surrounding quotes, list markers and accidental JSON
// wrappers from a model response, returning only the plain translated text.
// Returns an empty string when nothing usable remains.
export function cleanTranslationOutput(raw: string): string {
  if (typeof raw !== 'string') return '';
  let text = raw.trim();
  if (!text) return '';

  // Remove ```lang fenced code blocks.
  text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();

  // Attempt to unwrap a JSON object like {"translated_text":"..."} or {"text":"..."}.
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const candidate =
        parsed.translated_text ?? parsed.text ?? parsed.translation ?? parsed.result;
      if (typeof candidate === 'string' && candidate.trim()) {
        text = candidate.trim();
      }
    } catch {
      // Not valid JSON; fall through and treat as plain text.
    }
  }

  // Collapse to the first non-empty line to drop trailing explanations.
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  text = firstLine ?? '';

  // Remove a leading list marker such as "1. " or "- ".
  text = text.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '');

  // Strip a single layer of surrounding quotes.
  text = text.replace(/^["'“”‘’「『]+/, '').replace(/["'“”‘’」』]+$/, '');

  return text.trim();
}

export function fieldForContentType(contentType: ContentType): 'name_zh' | 'title_zh' {
  return contentType === 'organization' ? 'name_zh' : 'title_zh';
}

// Redacts an error so DeepSeek keys, headers or stack traces never leak to the
// client or the cache. Only a short, safe reason code is kept.
export function safeErrorCode(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') {
    const message = error.message.toLowerCase();
    if (message.includes('timeout') || message.includes('aborted')) return 'timeout';
    if (message.includes('empty')) return 'empty_translation';
    if (message.includes('http')) return 'model_http_error';
    if (message.includes('network') || message.includes('fetch')) return 'network_error';
  }
  return 'translation_failed';
}

export interface ValidationResult {
  items?: ValidItem[];
  error?: string;
}

// Validates the request body. Rejects person types, oversized batches and
// oversized / empty text. Never trusts client source_text beyond size limits.
export function validateRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') return { error: '请求无效' };
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return { error: 'items 必须是数组' };
  if (items.length === 0) return { error: 'items 不能为空' };
  if (items.length > MAX_ITEMS) return { error: `每批最多 ${MAX_ITEMS} 条` };

  const valid: ValidItem[] = [];
  for (const raw of items as TranslateItemInput[]) {
    if (!raw || typeof raw !== 'object') return { error: '条目格式无效' };
    if (raw.content_type !== 'organization' && raw.content_type !== 'paper') {
      return { error: 'content_type 只允许 organization 或 paper' };
    }
    if (typeof raw.id !== 'string' || !UUID_PATTERN.test(raw.id)) {
      return { error: '记录标识无效' };
    }
    if (
      raw.source_text != null &&
      (typeof raw.source_text !== 'string' || raw.source_text.length > MAX_TEXT_LENGTH)
    ) {
      return { error: `单条文本最多 ${MAX_TEXT_LENGTH} 个字符` };
    }
    valid.push({ content_type: raw.content_type, id: raw.id });
  }
  return { items: valid };
}

export interface SourceRecord {
  // Normalized original text to translate, or null when the record does not
  // exist / has no source text.
  text: string | null;
  // True when the record exists but must be skipped (e.g. an organization whose
  // type is neither school nor company).
  skip: boolean;
}

export interface CacheEntry {
  status: 'completed' | 'failed';
  translated_text?: string;
}

export interface TranslationDeps {
  // Reads the authoritative original text for a record from the database.
  readSource(item: ValidItem): Promise<SourceRecord | null>;
  // Looks up an existing cache row for this exact content_type + source_text.
  readCache(contentType: ContentType, sourceText: string): Promise<CacheEntry | null>;
  // Calls DeepSeek. May throw on timeout / http / network errors.
  callModel(contentType: ContentType, sourceText: string): Promise<string>;
  // Persists a cache row (completed or failed) for reuse.
  writeCache(row: {
    contentType: ContentType;
    sourceText: string;
    status: 'completed' | 'failed';
    translatedText: string;
    error?: string;
  }): Promise<void>;
  // Writes the translated value into organizations.name_zh / papers.title_zh.
  writeTarget(item: ValidItem, translatedText: string): Promise<void>;
}

// Runs the ordered per-item translation flow described in the design document.
// A single item failure never affects the others.
export async function translateItem(
  item: ValidItem,
  deps: TranslationDeps,
): Promise<TranslateItemResult> {
  const base = { id: item.id, content_type: item.content_type } as const;
  try {
    const source = await deps.readSource(item);
    if (source === null || source.text === null) {
      return { ...base, status: 'skipped', error: 'record_not_found' };
    }
    if (source.skip) {
      return { ...base, status: 'skipped', error: 'type_not_translatable' };
    }

    const sourceText = normalizeWhitespace(source.text);
    if (!sourceText) {
      return { ...base, status: 'skipped', error: 'empty_source' };
    }

    // Already-Chinese content is written back verbatim and never billed.
    if (isProbablyChinese(sourceText)) {
      await deps.writeTarget(item, sourceText);
      return { ...base, status: 'completed', translated_text: sourceText };
    }

    // Reuse a successful cache hit; do not call DeepSeek again.
    const cached = await deps.readCache(item.content_type, sourceText);
    if (cached && cached.status === 'completed' && cached.translated_text) {
      await deps.writeTarget(item, cached.translated_text);
      return { ...base, status: 'completed', translated_text: cached.translated_text };
    }

    let translated: string;
    try {
      const raw = await deps.callModel(item.content_type, sourceText);
      translated = cleanTranslationOutput(raw);
    } catch (error) {
      const code = safeErrorCode(error);
      await deps.writeCache({
        contentType: item.content_type,
        sourceText,
        status: 'failed',
        translatedText: sourceText,
        error: code,
      });
      return { ...base, status: 'failed', error: code };
    }

    if (!translated) {
      await deps.writeCache({
        contentType: item.content_type,
        sourceText,
        status: 'failed',
        translatedText: sourceText,
        error: 'empty_translation',
      });
      return { ...base, status: 'failed', error: 'empty_translation' };
    }

    await deps.writeCache({
      contentType: item.content_type,
      sourceText,
      status: 'completed',
      translatedText: translated,
    });
    await deps.writeTarget(item, translated);
    return { ...base, status: 'completed', translated_text: translated };
  } catch (error) {
    return { ...base, status: 'failed', error: safeErrorCode(error) };
  }
}

export async function translateItems(
  items: ValidItem[],
  deps: TranslationDeps,
): Promise<TranslateItemResult[]> {
  const results: TranslateItemResult[] = [];
  for (const item of items) {
    results.push(await translateItem(item, deps));
  }
  return results;
}

// Builds the DeepSeek prompt. Kept here so prompt wording is covered by tests.
export function buildTranslationPrompt(contentType: ContentType): string {
  const noun = contentType === 'organization' ? '机构名称（公司或学校）' : '论文标题';
  return [
    `你是一个专业翻译助手，只负责把${noun}翻译成简体中文。`,
    '严格遵守以下规则：',
    '1. 如果内容已经是中文，原样返回。',
    '2. 保留公司品牌、学校简称、产品名和专业缩写（如 MIT、GPT、AI）。',
    '3. 不要翻译人名。',
    '4. 只返回译文本身，不要添加解释、引号、序号或 Markdown。',
    '5. 无法可靠翻译时，返回原文。',
  ].join('\n');
}
