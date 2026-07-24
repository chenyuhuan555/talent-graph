import { describe, expect, it } from 'vitest';

import { validateCrawlerRequest, workflowDispatchPayload } from '../../supabase/functions/_shared/crawler';
import { triggerCrawler } from '@/lib/data/crawler';

describe('crawler trigger contract', () => {
  it('accepts bounded batch options and builds a main dispatch payload', () => {
    const request = validateCrawlerRequest({ max: 50, keywords: 'large language model' });
    expect(request.error).toBeUndefined();
    expect(workflowDispatchPayload(request.value!)).toEqual({
      ref: 'main',
      inputs: { max: '50', keywords: 'large language model' },
    });
  });

  it('rejects unsafe batch sizes', () => {
    expect(validateCrawlerRequest({ max: 0 }).error).toContain('max');
    expect(validateCrawlerRequest({ max: 601 }).error).toContain('max');
  });

  it('invokes the trigger function and returns its queued response', async () => {
    const invoke = async () => ({ data: { status: 'queued', max: 10 }, error: null });
    await expect(triggerCrawler({ max: 10 }, { functions: { invoke } } as never)).resolves.toEqual({
      status: 'queued', max: 10,
    });
  });
});
