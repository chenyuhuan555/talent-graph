import { describe, expect, it, vi } from 'vitest';

import { displayOrganizationName, displayPaperTitle } from '@/lib/display';
import {
  cleanTranslationOutput,
  fieldForContentType,
  isProbablyChinese,
  normalizeWhitespace,
  translateItem,
  translateItems,
  validateRequest,
  type TranslationDeps,
  type ValidItem,
} from '../../supabase/functions/_shared/translation';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

function makeDeps(overrides: Partial<TranslationDeps> = {}): TranslationDeps {
  return {
    readSource: vi.fn().mockResolvedValue({ text: 'Massachusetts Institute of Technology', skip: false }),
    readCache: vi.fn().mockResolvedValue(null),
    callModel: vi.fn().mockResolvedValue('麻省理工学院'),
    writeCache: vi.fn().mockResolvedValue(undefined),
    writeTarget: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('validateRequest', () => {
  it('accepts organization and paper items', () => {
    const result = validateRequest({ items: [
      { content_type: 'organization', id: UUID },
      { content_type: 'paper', id: UUID_B },
    ] });
    expect(result.error).toBeUndefined();
    expect(result.items).toHaveLength(2);
  });

  it('rejects the person content type', () => {
    const result = validateRequest({ items: [{ content_type: 'person', id: UUID }] });
    expect(result.items).toBeUndefined();
    expect(result.error).toContain('content_type');
  });

  it('rejects an empty batch and an oversized batch', () => {
    expect(validateRequest({ items: [] }).error).toBeTruthy();
    const tooMany = Array.from({ length: 21 }, () => ({ content_type: 'organization', id: UUID }));
    expect(validateRequest({ items: tooMany }).error).toContain('20');
  });

  it('rejects source_text longer than the limit and non-uuid ids', () => {
    const long = 'a'.repeat(1001);
    expect(validateRequest({ items: [{ content_type: 'paper', id: UUID, source_text: long }] }).error)
      .toContain('1000');
    expect(validateRequest({ items: [{ content_type: 'paper', id: 'not-a-uuid' }] }).error)
      .toContain('标识');
  });
});

describe('helpers', () => {
  it('maps content types to the correct target column', () => {
    expect(fieldForContentType('organization')).toBe('name_zh');
    expect(fieldForContentType('paper')).toBe('title_zh');
  });

  it('detects already-Chinese text but not mixed strings', () => {
    expect(isProbablyChinese('清华大学')).toBe(true);
    expect(isProbablyChinese('OpenAI 公司')).toBe(false);
    expect(isProbablyChinese('Attention Is All You Need')).toBe(false);
  });

  it('normalizes whitespace', () => {
    expect(normalizeWhitespace('  Hello   World  ')).toBe('Hello World');
  });

  it('cleans markdown fences, json wrappers and quotes from model output', () => {
    expect(cleanTranslationOutput('```\n麻省理工学院\n```')).toBe('麻省理工学院');
    expect(cleanTranslationOutput('{"translated_text":"麻省理工学院"}')).toBe('麻省理工学院');
    expect(cleanTranslationOutput('"清华大学"')).toBe('清华大学');
    expect(cleanTranslationOutput('1. 谷歌')).toBe('谷歌');
  });
});

describe('translateItem flow', () => {
  const orgItem: ValidItem = { content_type: 'organization', id: UUID };

  it('returns Chinese source verbatim without calling DeepSeek', async () => {
    const deps = makeDeps({ readSource: vi.fn().mockResolvedValue({ text: '清华大学', skip: false }) });
    const result = await translateItem(orgItem, deps);
    expect(result.status).toBe('completed');
    expect(result.translated_text).toBe('清华大学');
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(deps.writeTarget).toHaveBeenCalledWith(orgItem, '清华大学');
  });

  it('skips organizations whose type is not translatable', async () => {
    const deps = makeDeps({ readSource: vi.fn().mockResolvedValue({ text: 'Some Lab', skip: true }) });
    const result = await translateItem(orgItem, deps);
    expect(result.status).toBe('skipped');
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(deps.writeTarget).not.toHaveBeenCalled();
  });

  it('reuses a completed cache hit instead of calling DeepSeek', async () => {
    const deps = makeDeps({
      readCache: vi.fn().mockResolvedValue({ status: 'completed', translated_text: '麻省理工学院' }),
    });
    const result = await translateItem(orgItem, deps);
    expect(result.status).toBe('completed');
    expect(result.translated_text).toBe('麻省理工学院');
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(deps.writeCache).not.toHaveBeenCalled();
    expect(deps.writeTarget).toHaveBeenCalledWith(orgItem, '麻省理工学院');
  });

  it('calls DeepSeek on a cache miss and writes cache + target', async () => {
    const deps = makeDeps();
    const result = await translateItem(orgItem, deps);
    expect(result.status).toBe('completed');
    expect(result.translated_text).toBe('麻省理工学院');
    expect(deps.callModel).toHaveBeenCalledTimes(1);
    expect(deps.writeCache).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', translatedText: '麻省理工学院' }));
    expect(deps.writeTarget).toHaveBeenCalledWith(orgItem, '麻省理工学院');
  });

  it('records a failed status when DeepSeek throws, without writing the target', async () => {
    const deps = makeDeps({ callModel: vi.fn().mockRejectedValue(new Error('request timeout')) });
    const result = await translateItem(orgItem, deps);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('timeout');
    expect(deps.writeCache).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(deps.writeTarget).not.toHaveBeenCalled();
  });

  it('records a failed status when the model returns an empty translation', async () => {
    const deps = makeDeps({ callModel: vi.fn().mockResolvedValue('   ') });
    const result = await translateItem(orgItem, deps);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('empty_translation');
    expect(deps.writeTarget).not.toHaveBeenCalled();
  });

  it('skips records that no longer exist', async () => {
    const deps = makeDeps({ readSource: vi.fn().mockResolvedValue(null) });
    const result = await translateItem(orgItem, deps);
    expect(result.status).toBe('skipped');
    expect(result.error).toBe('record_not_found');
  });
});

describe('translateItems isolation', () => {
  it('continues after a single item failure', async () => {
    const deps = makeDeps({
      callModel: vi.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce('谷歌'),
    });
    const results = await translateItems([
      { content_type: 'organization', id: UUID },
      { content_type: 'organization', id: UUID_B },
    ], deps);
    expect(results[0].status).toBe('failed');
    expect(results[1].status).toBe('completed');
    expect(results[1].translated_text).toBe('谷歌');
  });
});

describe('display helpers', () => {
  it('prefers the Chinese organization name, falling back to name then english_name', () => {
    expect(displayOrganizationName({ name: 'MIT', name_zh: '麻省理工学院', english_name: 'MIT' })).toBe('麻省理工学院');
    expect(displayOrganizationName({ name: 'MIT', name_zh: '  ', english_name: 'MIT University' })).toBe('MIT');
    expect(displayOrganizationName({ name: '', name_zh: undefined, english_name: 'MIT University' })).toBe('MIT University');
  });

  it('prefers the Chinese paper title, falling back to the original title', () => {
    expect(displayPaperTitle({ title: 'Attention Is All You Need', title_zh: '注意力就是你所需要的' })).toBe('注意力就是你所需要的');
    expect(displayPaperTitle({ title: 'Attention Is All You Need', title_zh: undefined })).toBe('Attention Is All You Need');
  });
});
