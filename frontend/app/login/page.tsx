'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getActiveSession, loginWithUsername } from '@/lib/auth/session';


export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void getActiveSession().then((session) => {
      if (active && session) router.replace('/dashboard');
    }).catch(() => undefined);
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await loginWithUsername(username, password);
      router.replace('/dashboard');
    } catch {
      setError('用户名或密码错误，或账号已停用');
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <section className="surface w-full max-w-sm p-7" aria-labelledby="login-title">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest-600 text-white" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" />
              <line x1="12" y1="9" x2="6" y2="15" /><line x1="12" y1="9" x2="18" y2="15" />
            </svg>
          </div>
          <div>
            <h1 id="login-title" className="text-lg font-semibold text-forest-700">Talent Graph</h1>
            <p className="text-xs text-warm-400">公司内部人才关系工作台</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-warm-600">用户名</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-lg border border-warm-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-100"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-warm-600">密码</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-warm-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-100"
            />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-forest-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-forest-700 focus:outline-none focus:ring-2 focus:ring-forest-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? '正在登录…' : '登录'}
          </button>
        </form>
      </section>
    </main>
  );
}
