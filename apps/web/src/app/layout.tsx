import type { Metadata } from 'next';
import './globals.css';
import ClientLayout from './ClientLayout';

export const metadata: Metadata = {
  title: 'T3X - Version control for structured state',
  description: 'Version control for schema-backed YAML state',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
