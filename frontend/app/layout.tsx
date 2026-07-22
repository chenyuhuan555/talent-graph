import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Talent Graph · 人工智能人才关系网',
  description: '面向高精尖人才寻访的行业知识图谱、人才发现与关系触达工作台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans">{children}</body>
    </html>
  );
}
