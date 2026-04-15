import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DBT Studio',
  description: 'dbt model editor with AI assistant — Cursor-like IDE for dbt',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#1e1e1e] overflow-hidden h-screen">{children}</body>
    </html>
  );
}
