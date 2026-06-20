import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ГДЕ ТОРТ? — Накладные',
  description: 'Invoice generation platform for GDE TORT'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
