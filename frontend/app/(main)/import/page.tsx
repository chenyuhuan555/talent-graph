'use client';

import { useEffect, useState } from 'react';

import { getActiveSession } from '@/lib/auth/session';
import { triggerCrawler } from '@/lib/data/crawler';
import { useDomain } from '@/components/domain-context';
import { DOMAINS, getDomainByKey } from '@/lib/domains';
import type { AppProfile } from '@/lib/types';

export default function ImportPage() {
  const { domain: currentDomain } = useDomain();
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [max, setMax] = useState('10');
  const [crawlDomain, setCrawlDomain] = useState(currentDomain.key);
  const [keywords, setKeywords] = useState(currentDomain.keywords);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void getActiveSession().then((session) => setProfile(session?.profile ?? null));
  }, []);

  function handleDomainChange(next: string) {
    setCrawlDomain(next);
    setKeywords(getDomainByKey(next).keywords);
  }

  async function handleStart() {
    setRunning(true);
    setMessage('');
    setError('');
    try {
      const result = await triggerCrawler({ max: Number(max), keywords, domain: getDomainByKey(crawlDomain).industry });
      setMessage(`「${getDomainByKey(crawlDomain).industry}」采集任务已启动，每个关键词最多 ${result.max} 篇。后台运行期间可以继续使用网站。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法启动采集任务');
    } finally {
      setRunning(false);
    }
  }

  if (profile?.role !== 'admin') {
    return <div className="surface p-6 text-sm text-warm-500">只有管理员可以使用数据采集。</div>;
  }

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-warm-600">数据导入</h1>
        <p className="mt-1 text-sm text-warm-400">从公开科研和技术数据源采集最新人才、论文与机构。</p>
      </header>

      <section className="surface p-6">
        <h2 className="text-sm font-medium text-warm-600">一键采集</h2>
        <p className="mt-2 text-sm leading-6 text-warm-500">
          任务会在后台运行，写入 Supabase 后自动去重。首次建议保持每个关键词 10 篇，确认无误后再扩大数量。
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="text-sm text-warm-600">
            目标领域
            <select
              value={crawlDomain}
              onChange={(event) => handleDomainChange(event.target.value)}
              className="mt-1 w-full rounded-lg border border-warm-200 px-3 py-2 bg-white focus:outline-none focus:border-forest-500"
            >
              {DOMAINS.map((d) => (
                <option key={d.key} value={d.key}>{d.industry}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-warm-600">
            每个关键词最多篇数
            <input
              value={max}
              onChange={(event) => setMax(event.target.value)}
              type="number"
              min={1}
              max={600}
              className="mt-1 w-full rounded-lg border border-warm-200 px-3 py-2"
            />
          </label>
          <label className="text-sm text-warm-600">
            指定关键词（可留空，默认该领域关键词）
            <input
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              placeholder={getDomainByKey(crawlDomain).keywords}
              className="mt-1 w-full rounded-lg border border-warm-200 px-3 py-2"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={running}
          className="mt-5 rounded-lg bg-forest-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? '正在提交…' : '开始一键采集'}
        </button>
        {message && <div role="status" className="mt-4 rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-700">{message}</div>}
        {error && <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </section>
    </div>
  );
}
