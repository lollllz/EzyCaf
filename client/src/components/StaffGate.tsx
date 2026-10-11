import { useEffect, useState, type ReactNode } from 'react';
export default function StaffGate({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/staff/session').then(r => r.json()).then(s => setAuthenticated(s.authenticated === true)).catch(() => { setAuthenticated(false); setError('Cannot reach the café hub.'); }); }, []);
  if (authenticated) return <>{children}<button className="fixed right-4 bottom-4 rounded-xl border bg-white px-4 py-2 text-sm shadow" onClick={async () => { await fetch('/api/staff/logout', { method: 'POST' }); window.location.reload(); }}>Sign out</button></>;
  if (authenticated === null) return <main className="p-8" role="status">Checking staff session…</main>;
  return <main className="min-h-screen bg-stone-50 px-5 py-16"><form className="mx-auto max-w-md rounded-3xl border bg-white p-8 shadow-sm" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await fetch('/api/staff/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }); const result = await r.json(); if (!r.ok) throw Error(result.error); window.location.reload(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed.'); setBusy(false); }
  }}><p className="text-sm font-semibold uppercase tracking-widest text-emerald-800">EzyCaf · Staff</p><h1 className="mt-4 text-3xl font-bold">Your café workspace</h1><p className="mt-3 text-stone-600">Enter the staff access code shown in the host Terminal or in EzyCaf → Staff access code on the desktop app. Staff access also requires the café network.</p><label className="mt-6 block font-medium" htmlFor="staff-code">Staff access code</label><input id="staff-code" className="mt-2 w-full rounded-xl border p-3" type="password" autoComplete="current-password" required value={code} onChange={e => setCode(e.target.value)} />{error && <p role="alert" className="mt-3 text-red-700">{error}</p>}<button disabled={busy} className="mt-5 min-h-12 w-full rounded-xl bg-emerald-800 p-3 font-semibold text-white disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button><p className="mt-5 text-sm text-stone-500">Customers can scan their table QR and order without a staff code.</p></form></main>;
}
