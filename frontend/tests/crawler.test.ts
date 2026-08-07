import { describe, expect, it } from 'vitest';

import { validateCrawlerRequest, workflowDispatchPayload, ALLOWED_DOMAINS } from '../../supabase/functions/_shared/crawler';
import { triggerCrawler } from '@/lib/data/crawler';

describe('crawler trigger contract', () => {
  it('accepts bounded batch options and builds a main dispatch payload', () => {
    const request = validateCrawlerRequest({ max: 50, keywords: 'large language model' });
    expect(request.error).toBeUndefined();
    expect(workflowDispatchPayload(request.value!)).toEqual({
      ref: 'main',
      inputs: { max: '50', keywords: 'large language model', domain: '' },
    });
  });

  it('accepts a supported domain and forwards it in the payload', () => {
    const request = validateCrawlerRequest({ max: 10, keywords: '', domain: '量子计算' });
    expect(request.error).toBeUndefined();
    expect(request.value?.domain).toBe('量子计算');
    expect(workflowDispatchPayload(request.value!)).toEqual({
      ref: 'main',
      inputs: { max: '10', keywords: '', domain: '量子计算' },
    });
  });

  it('rejects unknown domains', () => {
    expect(validateCrawlerRequest({ max: 10, domain: '不明领域' }).error).toContain('domain');
  });

  it('rejects unsafe batch sizes', () => {
    expect(validateCrawlerRequest({ max: 0 }).error).toContain('max');
    expect(validateCrawlerRequest({ max: 601 }).error).toContain('max');
  });

  it('lists the supported domains (AI is the default)', () => {
    expect(ALLOWED_DOMAINS).toContain('人工智能');
    expect(ALLOWED_DOMAINS[0]).toBe('人工智能');
  });

  it('invokes the trigger function and returns its queued response', async () => {
    const invoke = async () => ({ data: { status: 'queued', max: 10 }, error: null });
    await expect(triggerCrawler({ max: 10 }, { functions: { invoke } } as never)).resolves.toEqual({
      status: 'queued', max: 10,
    });
  });
});
