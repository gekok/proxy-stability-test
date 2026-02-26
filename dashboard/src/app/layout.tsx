export const metadata = {
  title: 'Proxy Stability Test',
  description: 'Dashboard for proxy stability testing',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
