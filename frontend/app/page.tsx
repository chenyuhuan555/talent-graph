'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';

export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getToken() ? '/dashboard' : '/login');
  }, [router]);
  return <div className="min-h-screen flex items-center justify-center text-warm-400">跳转中…</div>;
}
