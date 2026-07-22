'use client';

import { useState, useRef } from 'react';
import { api, type ResumeParseResult } from '@/lib/api';

export default function ImportPage() {
  const [result, setResult] = useState<ResumeParseResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const data = await api.upload<ResumeParseResult>('/api/resume/upload', file);
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-warm-600">数据导入</h1>
        <p className="text-sm text-warm-400 mt-0.5">简历上传与解析 · 解析后需人工确认，不直接覆盖已有数据</p>
      </header>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="surface p-5">
          <h3 className="text-sm font-medium text-warm-600 mb-3">简历上传</h3>
          <div
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-warm-300 rounded-xl p-10 text-center cursor-pointer hover:border-forest-400 hover:bg-forest-50/30 transition"
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8C887E" strokeWidth="1.5" className="mx-auto mb-3">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div className="text-sm text-warm-500">{uploading ? '解析中…' : '点击或拖拽上传 PDF / DOCX'}</div>
            <div className="text-xs text-warm-400 mt-1">支持 PDF、DOC、DOCX 格式</div>
            <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
          {error && <div className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}
        </div>

        <div className="surface p-5">
          <h3 className="text-sm font-medium text-warm-600 mb-3">其他导入方式</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center px-3 py-2.5 border border-warm-200 rounded-lg text-warm-500">
              <span className="flex-1">批量导入 Excel</span>
              <span className="text-xs text-warm-400">即将支持</span>
            </div>
            <div className="flex items-center px-3 py-2.5 border border-warm-200 rounded-lg text-warm-500">
              <span className="flex-1">导入论文 JSON（OpenAlex / arXiv）</span>
              <span className="text-xs text-warm-400">即将支持</span>
            </div>
            <div className="flex items-center px-3 py-2.5 border border-warm-200 rounded-lg text-warm-500">
              <span className="flex-1">导入作者数据</span>
              <span className="text-xs text-warm-400">即将支持</span>
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="surface p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-warm-600">解析结果预览</h3>
            <span className="text-xs text-warm-400">⚠ 请确认后再入库，不会覆盖已有数据</span>
          </div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <Field label="姓名" value={result.name} />
            <Field label="邮箱" value={result.email} />
            <Field label="电话" value={result.phone} />
            <Field label="所在地" value={result.location} />
          </div>
          {result.domains.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-warm-400 mb-1">识别方向</div>
              <div className="flex gap-2">{result.domains.map((d) => <span key={d} className="text-xs px-2 py-0.5 rounded bg-forest-50 text-forest-700">{d}</span>)}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Section title="教育经历" items={result.education} />
            <Section title="工作经历" items={result.work_experience} />
            <Section title="项目经历" items={result.projects} />
            <Section title="论文" items={result.papers} />
          </div>
          {result.skills.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-warm-400 mb-1">技能</div>
              <div className="flex flex-wrap gap-1.5">{result.skills.map((s, i) => <span key={i} className="text-xs px-2 py-0.5 rounded bg-warm-100 text-warm-600">{typeof s === 'string' ? s : JSON.stringify(s)}</span>)}</div>
            </div>
          )}
          <div className="mt-5 flex gap-2">
            <button className="px-4 py-2 bg-forest-600 text-white text-sm rounded-lg hover:bg-forest-700">确认入库</button>
            <button onClick={() => setResult(null)} className="px-4 py-2 border border-warm-200 text-warm-600 text-sm rounded-lg hover:bg-warm-50">取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return <div><div className="text-xs text-warm-400 mb-1">{label}</div><div className="text-sm text-warm-600">{value || '—'}</div></div>;
}

function Section({ title, items }: { title: string; items: any[] }) {
  return (
    <div>
      <div className="text-xs text-warm-400 mb-1">{title}（{items.length}）</div>
      {items.length === 0 ? <div className="text-xs text-warm-400">无</div> : (
        <div className="space-y-1">{items.slice(0, 5).map((it, i) => <div key={i} className="text-xs text-warm-500 bg-warm-50 rounded px-2 py-1">{typeof it === 'string' ? it : it.raw || JSON.stringify(it)}</div>)}</div>
      )}
    </div>
  );
}
