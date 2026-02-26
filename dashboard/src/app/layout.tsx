import type { Metadata } from 'next';
import { Sidebar } from '@/components/layout/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Proxy Stability Test',
  description: 'Dashboard for proxy stability testing',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6 ml-64">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
