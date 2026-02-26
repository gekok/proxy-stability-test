export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Proxy Stability Test Dashboard</h1>
      <p>Dashboard coming in Sprint 2.</p>
      <p>API URL: {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}</p>
    </main>
  );
}
