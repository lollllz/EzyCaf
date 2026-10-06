import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { money, formatSynced } from '../lib/format';
import type { MenuItem, Settings } from '../lib/types';

const ACCENTS = [
  '#0F766E',
  '#B45309',
  '#7C3AED',
  '#BE123C',
  '#0369A1',
  '#15803D',
  '#1E293B',
  '#C2410C',
];

const emptyForm = (): Partial<MenuItem> => ({
  name: '',
  description: '',
  price: 0,
  category: 'Mains',
  available: true,
  sortOrder: 0,
});

export default function AdminPage() {
  const { hub, menu, connected, isDemo, refreshMenu } = useSocket();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState('');
  const [accent, setAccent] = useState('#0F766E');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [supabaseSync, setSupabaseSync] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<MenuItem>>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s: Settings) => {
        setSettings(s);
        setName(s.name);
        setAccent(s.accent);
        setSupabaseUrl(s.supabaseUrl);
        setSupabaseAnonKey(s.supabaseAnonKey);
        setSupabaseSync(!!s.supabaseSync);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 2500);
  }

  useEffect(() => {
    if (isDemo) return;
    const timer = window.setInterval(() => {
      fetch('/api/settings').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((s: Settings) => setSettings(s)).catch(() => {});
    }, 10000);
    return () => window.clearInterval(timer);
  }, [isDemo]);

  async function saveSettings(partial?: Partial<Settings>) {
    setSaving(true);
    try {
      const body = {
        name,
        accent,
        supabaseUrl,
        supabaseAnonKey,
        supabaseSync,
        ...partial,
      };
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Settings were not saved');
      const s = await res.json();
      setSettings(s);
      flash('Settings saved');
    } catch {
      flash('Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    if (file.size > 200 * 1024) {
      flash('Logo must be under 200KB');
      return;
    }
    const fd = new FormData();
    fd.append('logo', file);
    try {
      const res = await fetch('/api/settings/logo', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('upload');
      const s = await res.json();
      setSettings((prev) => (prev ? { ...prev, ...s } : s));
      flash('Logo uploaded');
    } catch {
      flash('Upload failed');
    }
  }

  async function removeLogo() {
    const res = await fetch('/api/settings/logo', { method: 'DELETE' });
    const s = await res.json();
    setSettings(s);
    flash('Logo removed');
  }

  async function saveMenuItem() {
    if (isDemo) { flash('Menu changes need the live cafe hub; demo has no database.'); return; }
    if (!form.name?.trim()) {
      flash('Name required');
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description || '',
      price: Number(form.price) || 0,
      category: form.category || 'Mains',
      available: form.available !== false,
      sortOrder: Number(form.sortOrder) || 0,
    };
    const url = editingId ? `/api/menu/${editingId}` : '/api/menu';
    const method = editingId ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Item could not be saved');
      await refreshMenu();
      setForm(emptyForm());
      setEditingId(null);
      flash(editingId ? 'Item updated' : 'Item added');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Save failed');
    }
  }

  function editItem(item: MenuItem) {
    setEditingId(item.id);
    setForm({ ...item });
  }

  async function deleteItem(id: string) {
    if (isDemo) { flash('Menu changes need the live cafe hub; demo has no database.'); return; }
    if (!confirm('Delete this menu item?')) return;
    try {
      const res = await fetch(`/api/menu/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.ok) throw new Error(result.error || 'Delete failed. The item has not been removed.');
      await refreshMenu();
      if (editingId === id) { setEditingId(null); setForm(emptyForm()); }
      flash(result.cloudSync === 'pending' ? 'Deleted locally. Cloud sync queued.' : 'Item deleted');
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Delete failed');
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-line bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Admin</h1>
          <p className="text-sm text-muted">
            Quiet settings · {connected ? 'Live' : '…'}
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link className="btn btn-ghost" to="/setup">Setup guide</Link>
          <Link className="btn btn-ghost" to="/">Hub</Link>
          <Link className="btn btn-ghost" to="/kitchen">Kitchen</Link>
          <Link className="btn btn-ghost" to="/cashier">Cashier</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 p-5 pb-16">
        {/* Brand */}
        <section className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Brand</h2>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Restaurant name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>

          <div>
            <span className="mb-2 block text-sm text-muted">Accent color</span>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  className="h-11 w-11 rounded-full border-2 border-white shadow ring-1 ring-line"
                  style={{
                    background: c,
                    outline: accent === c ? `3px solid ${c}` : undefined,
                    outlineOffset: 2,
                  }}
                  onClick={() => setAccent(c)}
                />
              ))}
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-11 w-11 cursor-pointer rounded-full border-0 bg-transparent p-0"
                aria-label="Custom accent"
              />
            </div>
            <button type="button" className="btn btn-accent mt-4" style={{ background: accent }}>
              Live preview button
            </button>
          </div>

          <div>
            <span className="mb-2 block text-sm text-muted">Logo (max ~200KB)</span>
            <div className="flex flex-wrap items-center gap-3">
              {(settings?.logoUrl || hub?.brand?.logoUrl) ? (
                <img
                  src={settings?.logoUrl || hub?.brand?.logoUrl}
                  alt="Logo"
                  className="h-16 w-16 rounded-xl border border-line object-contain bg-white"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-line text-xs text-muted">
                  None
                </div>
              )}
              <label className="btn btn-ghost cursor-pointer">
                Upload
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLogo(f);
                    e.target.value = '';
                  }}
                />
              </label>
              {(settings?.logoUrl || hub?.brand?.logoUrl) ? (
                <button type="button" className="btn btn-ghost" onClick={removeLogo}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          <button type="button" className="btn btn-accent" disabled={saving} onClick={() => saveSettings()}>
            {saving ? 'Saving…' : 'Save brand settings'}
          </button>
        </section>

        {/* Menu CRUD */}
        <section className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Menu</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm text-muted">Name</span>
              <input
                className="input"
                value={form.name || ''}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm text-muted">Description</span>
              <input
                className="input"
                value={form.description || ''}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted">Price (RM)</span>
              <input
                className="input"
                type="number"
                step="0.5"
                min="0"
                value={form.price ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted">Category</span>
              <input
                className="input"
                value={form.category || ''}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 sm:col-span-2 min-h-tap">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={form.available !== false}
                onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))}
              />
              <span className="text-sm">Available</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-accent" onClick={saveMenuItem}>
              {editingId ? 'Update item' : 'Add item'}
            </button>
            {editingId ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm());
                }}
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          <ul className="divide-y divide-line">
            {menu.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {item.name}{' '}
                    <span className="text-muted font-normal">· {money(item.price)}</span>
                  </p>
                  <p className="text-sm text-muted">
                    {item.category}
                    {!item.available ? ' · hidden' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-ghost text-sm" onClick={() => editItem(item)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-ghost text-sm text-red-700" onClick={() => deleteItem(item.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Supabase optional */}
        <section className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Supabase sync (menu only, optional)
          </h2>
          <p className="text-sm text-muted">
            Off by default. Never blocks LAN ordering. Syncs menu items to a{' '}
            <code className="rounded bg-cream px-1">menu_items</code> table when enabled.
          </p>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Project URL</span>
            <input
              className="input font-mono text-sm"
              placeholder="https://xxxx.supabase.co"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Anon key</span>
            <input
              className="input font-mono text-sm"
              placeholder="eyJ…"
              value={supabaseAnonKey}
              onChange={(e) => setSupabaseAnonKey(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-3 min-h-tap">
            <button
              type="button"
              role="switch"
              aria-checked={supabaseSync}
              className={`relative h-7 w-12 rounded-full transition ${supabaseSync ? 'bg-[var(--accent)]' : 'bg-line'}`}
              onClick={() => setSupabaseSync((v) => !v)}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${supabaseSync ? 'translate-x-5' : ''}`}
              />
            </button>
            <span className="text-sm font-medium">Sync {supabaseSync ? 'On' : 'Off'}</span>
          </label>
          <p className="text-sm text-muted">
            {settings?.syncError ? <span className="block text-red-700">Cloud sync pending: {settings.syncError}. Check the connection and database permissions.</span> : null}
            Last synced: <span className="text-ink">{formatSynced(settings?.lastSynced || '')}</span>
          </p>
          <button
            type="button"
            className="btn btn-accent"
            disabled={saving}
            onClick={() => saveSettings({ supabaseSync })}
          >
            Save sync settings
          </button>
        </section>
      </main>

      {msg ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg">
          {msg}
        </div>
      ) : null}
    </div>
  );
}
