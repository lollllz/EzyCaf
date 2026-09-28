import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import QtyStepper from '../components/QtyStepper';
import { money } from '../lib/format';
import type { CartItem } from '../lib/types';

export default function CustomerPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const { hub, menu, createOrder, connected } = useSocket();
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const table = hub?.tables.find((t) => t.id === tableId);
  const brand = hub?.brand;

  const categories = useMemo(() => {
    const map = new Map<string, typeof menu>();
    for (const item of menu.filter((m) => m.available)) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()];
  }, [menu]);

  const lines = Object.values(cart).filter((c) => c.qty > 0);
  const total = lines.reduce((s, c) => s + c.price * c.qty, 0);
  const count = lines.reduce((s, c) => s + c.qty, 0);

  function setQty(item: { id: string; name: string; price: number }, qty: number) {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[item.id];
      else next[item.id] = { id: item.id, name: item.name, price: item.price, qty };
      return next;
    });
  }

  async function send() {
    if (!tableId || lines.length === 0 || sending) return;
    setSending(true);
    const res = await createOrder(
      tableId,
      lines.map((l) => ({ id: l.id, qty: l.qty })),
      note
    );
    setSending(false);
    if (res.ok) {
      setCart({});
      setNote('');
      setToast('Order sent to kitchen!');
      setTimeout(() => setToast(null), 2800);
    } else {
      setToast(res.error || 'Could not send order');
      setTimeout(() => setToast(null), 3200);
    }
  }

  if (!tableId) {
    return <div className="p-8 text-muted">Missing table</div>;
  }

  return (
    <div className="min-h-screen bg-cream pb-36">
      <header className="sticky top-0 z-20 border-b border-line bg-cream/95 backdrop-blur px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          {brand?.logoUrl ? (
            <img src={brand.logoUrl} alt="" className="h-10 w-auto max-w-[160px] rounded-lg object-contain" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {brand?.name || 'Kamil'}
            </p>
            <h1 className="truncate text-xl font-bold">
              {table?.label || `Table ${tableId}`}
            </h1>
          </div>
          <span className={`text-xs font-medium ${connected ? 'text-green-700' : 'text-amber-700'}`}>
            {connected ? 'Online' : '…'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-8">
        {!table && hub ? (
          <div className="card p-6 text-center">
            <p className="font-semibold">Table not found</p>
            <p className="mt-1 text-muted text-sm">Ask staff for a valid QR code.</p>
          </div>
        ) : null}

        {categories.map(([cat, items]) => (
          <section key={cat}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{cat}</h2>
            <ul className="space-y-3">
              {items.map((item) => {
                const qty = cart[item.id]?.qty || 0;
                return (
                  <li key={item.id} className="card flex gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-ink">{item.name}</h3>
                        <span className="shrink-0 font-semibold tabular-nums">{money(item.price)}</span>
                      </div>
                      {item.description ? (
                        <p className="mt-1 text-sm text-muted">{item.description}</p>
                      ) : null}
                      <div className="mt-3">
                        {qty === 0 ? (
                          <button
                            type="button"
                            className="btn btn-accent px-5"
                            onClick={() => setQty(item, 1)}
                          >
                            Add
                          </button>
                        ) : (
                          <QtyStepper value={qty} onChange={(n) => setQty(item, n)} min={0} />
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {menu.length === 0 ? (
          <p className="text-center text-muted">Loading menu…</p>
        ) : null}
      </main>

      {/* Sticky cart */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
        <div className="mx-auto max-w-2xl px-4 py-3 space-y-2">
          {lines.length > 0 ? (
            <div className="motion-cart-expand space-y-2 overflow-hidden">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{count} item{count === 1 ? '' : 's'}</span>
                <span className="font-bold tabular-nums">{money(total)}</span>
              </div>
              <input
                className="input text-sm"
                placeholder="Note for kitchen (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </div>
          ) : null}
          {lines.length === 0 ? (
            <p className="text-center text-sm text-muted">Your cart is empty</p>
          ) : null}
          <button
            type="button"
            className="btn btn-accent w-full text-base"
            style={{ height: 48 }}
            disabled={lines.length === 0 || sending || !table}
            onClick={send}
          >
            {sending ? 'Sending…' : 'Send to kitchen'}
          </button>
        </div>
      </div>

      {toast ? (
        <div className="motion-toast fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
