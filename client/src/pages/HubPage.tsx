import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';

function tablePublicUrl(baseUrl: string, tableId: string, hashMode: boolean): string {
  const base = baseUrl.replace(/\/$/, '');
  return hashMode ? `${base}/#/t/${tableId}` : `${base}/t/${tableId}`;
}

function qrImgHtml(url: string): string {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(url)}`;
  return `<img src="${src}" width="200" height="200" alt="QR" style="display:block" />`;
}

export default function HubPage() {
  const { hub, connected, isDemo } = useSocket();
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const hashMode = import.meta.env.VITE_DEMO === 'true';

  useEffect(() => {
    if (!hub?.tables) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      if (isDemo || import.meta.env.VITE_DEMO === 'true') {
        for (const t of hub.tables) {
          const url = tablePublicUrl(hub.baseUrl, t.id, true);
          next[t.id] = qrImgHtml(url);
        }
      } else {
        await Promise.all(
          hub.tables.map(async (t) => {
            try {
              const res = await fetch(`/api/qr/${t.id}`);
              if (res.ok) next[t.id] = await res.text();
            } catch {
              /* ignore */
            }
          })
        );
      }
      if (!cancelled) setQrMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [hub?.tables, hub?.baseUrl, isDemo]);

  const brand = hub?.brand;

  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="border-b border-line px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {brand?.logoUrl ? (
            <img
              src={brand.logoUrl}
              alt=""
              className="h-10 w-auto max-w-[160px] object-contain rounded-xl"
            />
          ) : null}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{brand?.name || 'Kamil'}</h1>
            <p className="text-muted text-sm">
              Scan a table QR to order · {connected ? (isDemo ? 'Demo' : 'Live') : 'Connecting…'}
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm font-medium">
          <Link className="btn btn-ghost" to="/kitchen">Kitchen</Link>
          <Link className="btn btn-ghost" to="/cashier">Cashier</Link>
          <Link className="btn btn-ghost" to="/admin">Admin</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {!hub ? (
          <p className="text-muted">Loading hub…</p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {hub.tables.map((t) => {
              const publicUrl = tablePublicUrl(hub.baseUrl, t.id, hashMode);
              return (
                <div key={t.id} className="flex flex-col items-center rounded-2xl border border-line bg-white p-6 shadow-sm">
                  {brand?.logoUrl ? (
                    <img
                      src={brand.logoUrl}
                      alt=""
                      className="mb-3 h-10 w-auto max-w-[160px] object-contain"
                    />
                  ) : null}
                  <div
                    className="mb-4 flex items-center justify-center bg-white p-2"
                    style={{ width: 220, height: 220 }}
                    dangerouslySetInnerHTML={{
                      __html:
                        qrMap[t.id] ||
                        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#fff"/><text x="50%" y="50%" text-anchor="middle" fill="#999">…</text></svg>',
                    }}
                  />
                  <p className="text-lg font-bold">{t.label}</p>
                  <p className="mt-1 text-xs text-muted break-all text-center">{publicUrl}</p>
                  <Link
                    to={`/t/${t.id}`}
                    className="mt-3 text-sm font-semibold"
                    style={{ color: 'var(--accent)' }}
                  >
                    Open menu →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
        {hub?.baseUrl ? (
          <p className="mt-10 text-center text-sm text-muted">
            {isDemo ? 'Demo base' : 'LAN base'}:{' '}
            <span className="font-mono text-ink">{hub.baseUrl}</span>
          </p>
        ) : null}
      </main>
    </div>
  );
}
