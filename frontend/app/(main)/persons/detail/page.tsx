'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getExperiences, getMaskedContacts, getPapers, getPerson, getPersonMatches, getProjects } from '@/lib/data/persons';
import { getPersonOutreach } from '@/lib/data/outreach';
import { getPersonRelationships } from '@/lib/data/relationships';
import { externalHttpHref, personDetailHref } from '@/lib/routes';
import { LEVEL_COLOR, STRENGTH_LABEL, REL_TYPE_LABEL, parseJSON, type Person, type Experience, type Paper, type Project, type Contact, type Relationship, type Outreach, type Match } from '@/lib/types';
import { displayPaperTitle } from '@/lib/display';
import { ContactForm } from '@/components/forms/contact-form';
import { OutreachForm } from '@/components/forms/outreach-form';

const TABS = ['概览', '经历时间轴', '论文成果', '项目成果', '关系网络', '联系方式', '触达记录', '岗位匹配'];

export default function PersonDetailPage() {
  return <Suspense fallback={<div className="text-warm-400">加载中…</div>}><PersonDetailContent /></Suspense>;
}

function PersonDetailContent() {
  const id = useSearchParams().get('id') || '';
  const router = useRouter();
  const [person, setPerson] = useState<Person | null>(null);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    getPerson(id).then(setPerson).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-warm-400">加载中…</div>;
  if (!person) return <div className="text-warm-500">未指定人才，或该人才不存在。</div>;

  return (
    <div>
      {/* 顶部信息 */}
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-warm-400 hover:text-forest-600 mb-3 flex items-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <div className="surface p-6 flex items-start">
          <div className="w-16 h-16 rounded-2xl bg-forest-100 text-forest-700 flex items-center justify-center text-2xl font-semibold mr-5">
            {(person.chinese_name || person.english_name || '?')[0]}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-semibold text-warm-600">{person.chinese_name || person.english_name}</h1>
              {person.english_name && person.chinese_name && <span className="text-sm text-warm-400">{person.english_name}</span>}
              {person.talent_level && <span className={`text-xs px-2 py-0.5 rounded ${LEVEL_COLOR[person.talent_level]}`}>{person.talent_level} 级</span>}
              <span className="text-xs px-2 py-0.5 rounded bg-forest-50 text-forest-700">{person.primary_domain}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-warm-100 text-warm-500">{person.outreach_status}</span>
            </div>
            <div className="text-sm text-warm-500">{person.current_position} · {person.organization_name} · {person.location}</div>
            <div className="flex gap-5 mt-3 text-xs text-warm-400">
              <span>论文 <b className="text-warm-600">{person.paper_count}</b></span>
              <span>项目 <b className="text-warm-600">{person.project_count}</b></span>
              <span>关系 <b className="text-warm-600">{person.relationship_count}</b></span>
              <span>联系方式 <b className="text-warm-600">{person.contact_count}</b></span>
              <span>负责人 <b className="text-warm-600">{person.owner_name || '未分配'}</b></span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab(6)} className="px-4 py-2 bg-forest-600 text-white text-sm rounded-lg hover:bg-forest-700">创建触达</button>
            <Link href={`/graph?person=${person.id}`} className="px-4 py-2 border border-warm-200 text-warm-600 text-sm rounded-lg hover:bg-warm-50">关系图</Link>
          </div>
        </div>
      </div>

      {/* Tab */}
      <div className="border-b border-warm-200 mb-5 flex gap-1">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`px-4 py-2.5 text-sm border-b-2 transition ${tab === i ? 'border-forest-600 text-forest-700 font-medium' : 'border-transparent text-warm-500 hover:text-warm-600'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="surface p-6">
        {tab === 0 && <OverviewTab person={person} />}
        {tab === 1 && <ExperiencesTab personId={person.id} />}
        {tab === 2 && <PapersTab personId={person.id} />}
        {tab === 3 && <ProjectsTab personId={person.id} />}
        {tab === 4 && <RelationshipsTab personId={person.id} />}
        {tab === 5 && <ContactsTab personId={person.id} />}
        {tab === 6 && <OutreachTab personId={person.id} />}
        {tab === 7 && <MatchesTab personId={person.id} />}
      </div>
    </div>
  );
}

function OverviewTab({ person }: { person: Person }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-warm-600 mb-2">人才摘要</h3>
        <div className="bg-warm-50 rounded-lg p-4 text-sm text-warm-600 leading-relaxed">
          {person.summary_raw || '暂无摘要，可由 AI 生成或人工补充。'}
        </div>
        <div className="mt-1 text-xs text-warm-400">⚠ AI 生成内容仅供参考，允许人工修改</div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="中文名" value={person.chinese_name} />
        <Field label="英文名" value={person.english_name} />
        <Field label="所在地区" value={person.location} />
        <Field label="行业" value={person.industry} />
        <Field label="主要方向" value={person.primary_domain} />
        <Field label="人才级别" value={person.talent_level} />
        <Field label="数据来源" value={person.source_type} />
        <Field label="审核状态" value={person.review_status} />
        <Field label="信息完整度" value={`${Math.round(person.data_completeness || 0)}%`} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-xs text-warm-400 mb-1">{label}</div>
      <div className="text-sm text-warm-600">{value || '—'}</div>
    </div>
  );
}

function ExperiencesTab({ personId }: { personId: string }) {
  const [data, setData] = useState<Experience[]>([]);
  useEffect(() => { getExperiences(personId).then(setData); }, [personId]);
  const typeLabel: Record<string, string> = { education: '教育', work: '工作', research: '研究' };
  return (
    <div className="space-y-3">
      {data.length === 0 ? <Empty /> : data.map((e) => (
        <div key={e.id} className="flex gap-4 border-l-2 border-forest-300 pl-4 py-1">
          <div className="w-20 text-xs text-warm-400 pt-0.5">{e.start_date?.slice(0, 7)} ~ {e.is_current ? '至今' : e.end_date?.slice(0, 7)}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-warm-600">{e.organization_name || '未知机构'}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-warm-100 text-warm-500">{typeLabel[e.experience_type] || e.experience_type}</span>
              {e.verified && <span className="text-xs text-forest-600">✓ 已确认</span>}
            </div>
            <div className="text-sm text-warm-500">{e.title}{e.department ? ` · ${e.department}` : ''}{e.major ? ` · ${e.major}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PapersTab({ personId }: { personId: string }) {
  const [data, setData] = useState<Paper[]>([]);
  useEffect(() => { getPapers(personId).then(setData); }, [personId]);
  return (
    <div className="space-y-3">
      {data.length === 0 ? <Empty /> : data.map((p) => (
        <div key={p.id} className="border border-warm-200 rounded-lg p-3">
          <div className="flex items-start justify-between">
            <a href={externalHttpHref(p.source_url)} target="_blank" rel="noreferrer" className="text-sm font-medium text-forest-700 hover:underline">{displayPaperTitle(p)}</a>
            <span className="text-xs text-warm-400 ml-3 shrink-0">引用 {p.citation_count}</span>
          </div>
          {p.title_zh?.trim() && p.title?.trim() && p.title_zh.trim() !== p.title.trim() && (
            <div className="text-xs text-warm-400 mt-1">原文：{p.title}</div>
          )}
          <div className="text-xs text-warm-400 mt-1">{p.venue} · {p.publication_date?.slice(0, 7)}</div>
        </div>
      ))}
    </div>
  );
}

function ProjectsTab({ personId }: { personId: string }) {
  const [data, setData] = useState<Project[]>([]);
  useEffect(() => { getProjects(personId).then(setData); }, [personId]);
  return (
    <div className="space-y-3">
      {data.length === 0 ? <Empty /> : data.map((p) => (
        <div key={p.id} className="border border-warm-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <a href={externalHttpHref(p.url)} target="_blank" rel="noreferrer" className="text-sm font-medium text-forest-700 hover:underline">{p.name}</a>
            <span className="text-xs text-warm-400">★ {p.stars_count}</span>
          </div>
          <div className="text-xs text-warm-400 mt-1">{p.project_type} · {p.organization_name}</div>
        </div>
      ))}
    </div>
  );
}

function RelationshipsTab({ personId }: { personId: string }) {
  const [data, setData] = useState<Relationship[]>([]);
  useEffect(() => { getPersonRelationships(personId).then(setData); }, [personId]);
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-warm-400">共 {data.length} 条关系（默认按关系分降序）</span>
        <Link href={`/graph?person=${personId}`} className="text-xs text-forest-600 hover:underline">查看关系图 →</Link>
      </div>
      {data.length === 0 ? <Empty /> : data.map((r) => (
        <Link key={r.id} href={personDetailHref(r.person_a_id === personId ? r.person_b_id : r.person_a_id)} className="flex items-center px-3 py-2.5 border border-warm-200 rounded-lg hover:bg-warm-50 transition">
          <div className="w-9 h-9 rounded-full bg-forest-100 text-forest-700 flex items-center justify-center text-sm mr-3">{r.the_other_name?.[0]}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-warm-600">{r.the_other_name}</div>
            <div className="text-xs text-warm-400">{r.the_other_org || '—'} · {REL_TYPE_LABEL[r.relationship_type] || r.relationship_type}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-warm-500">{STRENGTH_LABEL[r.relationship_strength || ''] || r.relationship_strength}</div>
            <div className="text-xs text-warm-400">分 {r.score} · 证据 {r.evidence_count}</div>
          </div>
          {r.is_verified ? <span className="ml-3 text-xs px-2 py-0.5 rounded bg-forest-50 text-forest-700">✓ 人工确认</span>
            : <span className="ml-3 text-xs px-2 py-0.5 rounded bg-warm-100 text-warm-500">系统推断</span>}
          {r.can_introduce && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-forest-600 text-white">可引荐</span>}
        </Link>
      ))}
    </div>
  );
}

function ContactsTab({ personId }: { personId: string }) {
  const [data, setData] = useState<Contact[]>([]);
  const [showForm, setShowForm] = useState(false);
  useEffect(() => { getMaskedContacts(personId).then(setData); }, [personId]);
  const typeLabel: Record<string, string> = { email: '邮箱', phone: '电话', homepage: '个人主页', github: 'GitHub', huggingface: 'HuggingFace' };
  return (
    <div className="space-y-2">
      <div className="mb-2 flex items-center justify-between"><span className="text-xs text-warm-400">⚠ 联系方式默认脱敏显示，查看完整内容需相应权限并记录审计日志</span><button onClick={() => setShowForm(true)} className="rounded bg-forest-600 px-3 py-1 text-xs text-white">添加</button></div>
      {data.length === 0 ? <Empty /> : data.map((c) => (
        <div key={c.id} className="flex items-center px-3 py-2.5 border border-warm-200 rounded-lg">
          <span className="text-xs px-2 py-0.5 rounded bg-warm-100 text-warm-500 mr-3">{typeLabel[c.contact_type] || c.contact_type}</span>
          <span className="text-sm text-warm-600 font-mono flex-1">{c.value || c.masked_value}</span>
          {c.is_valid ? <span className="text-xs text-forest-600">有效</span> : <span className="text-xs text-red-400">失效</span>}
          {!c.value && <span className="text-xs text-warm-400 ml-2">（脱敏）</span>}
        </div>
      ))}
      {showForm && <ContactForm personId={personId} onClose={() => setShowForm(false)} onSaved={(contact) => { setData((items) => [...items, contact]); setShowForm(false); }} />}
    </div>
  );
}

function OutreachTab({ personId }: { personId: string }) {
  const [data, setData] = useState<Outreach[]>([]);
  const [showForm, setShowForm] = useState(false);
  useEffect(() => { getPersonOutreach(personId).then(setData); }, [personId]);
  const statusLabel: Record<string, string> = { pending: '待回复', replied: '已回复', no_reply: '未回复' };
  const intentColor: Record<string, string> = { high: 'text-forest-600', medium: 'text-forest-500', low: 'text-warm-500', none: 'text-warm-400' };
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button onClick={() => setShowForm(true)} className="rounded bg-forest-600 px-3 py-1 text-xs text-white">新增触达</button></div>
      {data.length === 0 ? <Empty /> : data.map((o) => (
        <div key={o.id} className="border-l-2 border-forest-300 pl-4 py-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-warm-600">{o.consultant_name}</span>
            <span className="text-xs text-warm-400">{o.outreach_channel} · {new Date(o.outreach_at || '').toLocaleDateString('zh-CN')}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-warm-100 text-warm-500">{statusLabel[o.response_status || ''] || o.response_status}</span>
            <span className={`text-xs ${intentColor[o.intention_level || 'none']}`}>意向: {o.intention_level}</span>
            {o.willing_to_refer && <span className="text-xs px-1.5 py-0.5 rounded bg-forest-50 text-forest-700">愿引荐</span>}
          </div>
          <div className="text-sm text-warm-500">{o.content_summary}</div>
          {o.response_summary && <div className="text-sm text-warm-500 mt-1">回复：{o.response_summary}</div>}
          {o.next_follow_up_at && <div className="text-xs text-warm-400 mt-1">下次跟进：{new Date(o.next_follow_up_at).toLocaleString('zh-CN')}</div>}
        </div>
      ))}
      {showForm && <OutreachForm personId={personId} onClose={() => setShowForm(false)} onSaved={(record) => { setData((items) => [record, ...items]); setShowForm(false); }} />}
    </div>
  );
}

function MatchesTab({ personId }: { personId: string }) {
  const [data, setData] = useState<Match[]>([]);
  useEffect(() => { getPersonMatches(personId).then(setData); }, [personId]);
  return (
    <div className="space-y-3">
      <div className="text-xs text-warm-400 mb-2">⚠ 匹配结果由 AI 规则生成，仅作为顾问参考</div>
      {data.length === 0 ? <Empty text="暂无匹配记录，可在岗位管理中发起匹配" /> : data.map((m) => (
        <div key={m.id} className="border border-warm-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-medium text-warm-600">{m.position_title}</span>
              <span className="text-xs text-warm-400 ml-2">{m.company_name}</span>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-forest-700">{m.match_score}</div>
              <div className="text-[10px] text-warm-400">匹配分</div>
            </div>
          </div>
          <div className="text-xs text-warm-500 space-y-1">
            {parseJSON<string[]>(m.match_reasons)?.map((r, i) => <div key={i}>✓ {r}</div>)}
            {parseJSON<string[]>(m.risks)?.map((r, i) => <div key={i} className="text-red-500">⚠ {r}</div>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ text = '暂无数据' }: { text?: string }) {
  return <div className="text-center py-8 text-sm text-warm-400">{text}</div>;
}
