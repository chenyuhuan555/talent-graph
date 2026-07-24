import { requireData } from './errors';
import { defaultClient, type DataClient } from './shared';

export interface CrawlerOptions {
  max?: number;
  keywords?: string;
  /** 目标领域（persons.industry 中文枚举值），留空默认人工智能 */
  domain?: string;
}

export interface CrawlerQueuedResponse {
  status: 'queued';
  max: number;
}

export async function triggerCrawler(
  options: CrawlerOptions = {},
  client: DataClient = defaultClient(),
): Promise<CrawlerQueuedResponse> {
  const payload = await requireData(await client.functions.invoke('trigger-crawler', {
    body: { max: options.max ?? 10, keywords: options.keywords ?? '', domain: options.domain ?? '' },
  })) as CrawlerQueuedResponse;
  return payload;
}
