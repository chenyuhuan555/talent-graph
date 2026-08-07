'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_DOMAIN_KEY, DOMAIN_STORAGE_KEY, DOMAINS,
  getDomainByKey, type DomainConfig,
} from '@/lib/domains';

interface DomainContextValue {
  domain: DomainConfig;
  setDomainKey: (key: string) => void;
}

const DomainContext = createContext<DomainContextValue>({
  domain: DOMAINS[0],
  setDomainKey: () => undefined,
});

function applyTheme(domain: DomainConfig) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [shade, color] of Object.entries(domain.palette)) {
    root.style.setProperty(`--theme-${shade}`, color);
  }
  root.style.setProperty('--accent', domain.palette['600']);
  root.style.setProperty('--accent-light', domain.palette['500']);
}

function initialKey(): string {
  if (typeof window === 'undefined') return DEFAULT_DOMAIN_KEY;
  const fromUrl = new URLSearchParams(window.location.search).get('domain');
  if (fromUrl && DOMAINS.some((d) => d.key === fromUrl)) return fromUrl;
  const stored = window.localStorage.getItem(DOMAIN_STORAGE_KEY);
  if (stored && DOMAINS.some((d) => d.key === stored)) return stored;
  return DEFAULT_DOMAIN_KEY;
}

export function DomainProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState(DEFAULT_DOMAIN_KEY);

  useEffect(() => {
    const k = initialKey();
    setKey(k);
    applyTheme(getDomainByKey(k));
  }, []);

  const setDomainKey = useCallback((next: string) => {
    const domain = getDomainByKey(next);
    setKey(domain.key);
    applyTheme(domain);
    try {
      window.localStorage.setItem(DOMAIN_STORAGE_KEY, domain.key);
      const url = new URL(window.location.href);
      url.searchParams.set('domain', domain.key);
      window.history.replaceState(null, '', url.toString());
    } catch {
      // 存储不可用时仅在内存中切换
    }
  }, []);

  const value = useMemo(() => ({ domain: getDomainByKey(key), setDomainKey }), [key, setDomainKey]);
  return <DomainContext.Provider value={value}>{children}</DomainContext.Provider>;
}

export function useDomain(): DomainContextValue {
  return useContext(DomainContext);
}
