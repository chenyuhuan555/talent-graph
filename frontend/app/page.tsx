'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getActiveSession } from '@/lib/auth/session';

export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    void getActiveSession()
      .then((session) => {
        if (active) router.replace(session ? '/dashboard' : '/login');
      })
      .catch(() => {
        if (active) router.replace('/login');
      });
    return () => { active = false; };
  }, [router]);
  return <div role="status" className="min-h-screen flex items-center justify-center text-warm-400">正在验证登录状态…</div>;
}
