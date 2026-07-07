import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sigmachat — ศูนย์รวมแชททุกแพลตฟอร์ม',
  description: 'Sigmachat — Unified AI customer support across LINE, Facebook, Instagram, Shopee, TikTok, Lazada, WhatsApp, Web',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
