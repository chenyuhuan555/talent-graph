'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getActiveSession, logout, subscribeToAuthChanges } from '@/lib/auth/session';
import { DomainProvider, useDomain } from '@/components/domain-context';
import { DOMAINS } from '@/lib/domains';
import type { AppProfile } from '@/lib/types';

const NAV = [
  { href: '/dashboard', label: '首页', icon: 'home' },
  { href: '/persons', label: '人才库', icon: 'users' },
  { href: '/discovery', label: '人才发现', icon: 'sparkles' },
  { href: '/graph', label: '关系探索', icon: 'graph' },
  { href: '/organizations', label: '学校与公司', icon: 'building' },
  { href: '/positions', label: '岗位管理', icon: 'briefcase' },
  { href: '/outreach', label: '触达工作台', icon: 'chat' },
  { href: '/review', label: '数据审核', icon: 'check' },
];

const ADMIN_NAV = [
  { href: '/import', label: '数据导入', icon: 'upload' },
  { href: '/settings/members', label: '成员管理', icon: 'users' },
  { href: '/settings/audit', label: '审计记录', icon: 'check' },
];

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  leader: '项目负责人',
  consultant: '猎头顾问',
  operator: '数据运营',
};

function Icon({ name }: { name: string }) {
  const props = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const;
  switch (name) {
    case 'home': return <svg {...props}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    case 'users': return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case 'sparkles': return <svg {...props}><path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>;
    case 'graph': return <svg {...props}><circle cx="12" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><line x1="12" y1="9" x2="6" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>;
    case 'building': return <svg {...props}><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="9" y1="6" x2="9" y2="6"/><line x1="15" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="9" y2="10"/><line x1="15" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="9" y2="14"/><line x1="15" y1="14" x2="15" y2="14"/></svg>;
    case 'briefcase': return <svg {...props}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
    case 'chat': return <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case 'upload': return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
    case 'check': return <svg {...props}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    default: return null;
  }
}

function DomainSwitcher() {
  const { domain, setDomainKey } = useDomain();
  return (
    <select
      aria-label="切换领域"
      value={domain.key}
      onChange={(event) => setDomainKey(event.target.value)}
      className="mt-0.5 max-w-[150px] cursor-pointer rounded border-none bg-transparent p-0 text-[10px] text-warm-400 focus:outline-none hover:text-forest-600"
    >
      {DOMAINS.map((d) => (
        <option key={d.key} value={d.key}>{d.industry}人才关系网</option>
      ))}
    </select>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <DomainProvider>
      <MainLayoutInner>{children}</MainLayoutInner>
    </DomainProvider>
  );
}

function MainLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AppProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function refreshSession() {
      const activeSession = await getActiveSession();
      if (!active) return;
      if (!activeSession) {
        router.replace('/login');
        return;
      }
      setUser(activeSession.profile);
      setReady(true);
    }

    void refreshSession();
    const unsubscribe = subscribeToAuthChanges(() => void refreshSession());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  if (!ready) return <div role="status" className="min-h-screen flex items-center justify-center text-warm-400">加载中…</div>;

  return (
    <div className="min-h-screen flex">
      {/* 侧边栏 */}
      <aside className="w-60 bg-white border-r border-warm-200 flex flex-col fixed h-screen">
        <div className="h-14 flex items-center px-5 border-b border-warm-200">
          <div className="w-8 h-8 rounded-lg bg-forest-600 flex items-center justify-center mr-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="8" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" />
              <line x1="12" y1="11" x2="6" y2="15" /><line x1="12" y1="11" x2="18" y2="15" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-forest-700 leading-tight">Talent Graph</div>
            <DomainSwitcher />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2.5">
          {[...NAV, ...(user?.role === 'admin' ? ADMIN_NAV : [])].map((item) => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-3 py-2 rounded-lg text-sm mb-0.5 transition ${
                  active ? 'bg-forest-50 text-forest-700 font-medium' : 'text-warm-600 hover:bg-warm-50'
                }`}
              >
                <span className={active ? 'text-forest-600' : 'text-warm-400'}><Icon name={item.icon} /></span>
                <span className="ml-2.5">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-warm-200 p-3">
          <div className="flex items-center px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-forest-100 text-forest-700 flex items-center justify-center text-sm font-medium">
              {user?.display_name?.[0] || 'U'}
            </div>
            <div className="ml-2 flex-1 min-w-0">
              <div className="text-sm font-medium text-warm-600 truncate">{user?.display_name}</div>
              <div className="text-[10px] text-warm-400">{ROLE_LABEL[user?.role || ''] || user?.role}</div>
            </div>
            <button onClick={() => void handleLogout()} aria-label="退出登录" title="退出登录" className="text-warm-400 hover:text-red-500 p-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 ml-60 min-h-screen">
        <div className="p-8 max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
