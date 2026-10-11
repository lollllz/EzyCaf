import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import CustomerOrders, { type Receipt } from '../components/CustomerOrders';
import QtyStepper from '../components/QtyStepper';
import { money } from '../lib/format';
import type { CartItem } from '../lib/types';

export default function CustomerPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const { hub, menu, createOrder, connected } = useSocket();
  const [view,setView] = useState<'menu'|'orders'>('menu');
  const [receipts,setReceipts] = useState<Receipt[]>([]);
  useEffect(()=>{try { const saved=JSON.parse(localStorage.getItem(`ezycaf-receipts-${tableId}`)||'[]');setReceipts(Array.isArray(saved)?saved:[]); } catch {setReceipts([]);} },[tableId]);
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
      const id = res.order?.id || res.orderId;
      if (id && res.receiptToken) {
        const next = [...receipts.filter(r=>r.id!==id), {id,token:res.receiptToken,order:res.order}].slice(-20);
        setReceipts(next);
        try {localStorage.setItem(`ezycaf-receipts-${tableId}`,JSON.stringify(next));} catch {}
      }
      setView('orders');
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
    <div className="flex min-h-[100dvh] flex-col bg-cream">
      <header className="sticky top-0 z-20 shrink-0 border-b border-line bg-cream/95 backdrop-blur px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          {brand?.logoUrl ? (
            <img src={brand.logoUrl} alt="" className="h-10 w-auto max-w-[160px] rounded-lg object-contain" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {brand?.name || 'EzyCaf'}
            </p>
            <h1 className="truncate text-xl font-bold">
              {table?.label || `Table ${tableId}`}
            </h1>
          </div>
          <span className={`text-xs font-medium ${connected ? 'text-green-700' : 'text-amber-700'}`}>
            {connected ? 'Online' : '…'}
          </span>
        </div>
        <nav className="mx-auto mt-4 flex max-w-2xl gap-2" aria-label="Customer sections">
          <button className={`btn flex-1 ${view==='menu'?'btn-accent':'btn-ghost'}`} aria-pressed={view==='menu'} onClick={()=>setView('menu')}>Menu</button>
          <button className={`btn flex-1 ${view==='orders'?'btn-accent':'btn-ghost'}`} aria-pressed={view==='orders'} onClick={()=>setView('orders')}>My orders {receipts.length ? `(${receipts.length})`:''}</button>
        </nav>
      </header>

      {hub?.networkMode === 'customer-relay' && hub.cafeOnline === false ? <p role="alert" className="bg-amber-50 p-4 text-amber-900">The cafe is offline. Please order with staff.</p> : null}
      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-6 space-y-8">
        {!table && hub ? (
          <div className="card p-6 text-center">
            <p className="font-semibold">Table not found</p>
            <p className="mt-1 text-muted text-sm">Ask staff for a valid QR code.</p>
          </div>
        ) : null}

        {view==='orders' ? <CustomerOrders receipts={receipts} connected={connected && hub?.cafeOnline!==false} /> : <>
        <div className="rounded-2xl bg-white p-5"><h2 className="text-2xl font-bold">What sounds good?</h2><p className="mt-2 text-sm text-muted">Add items, check your cart and send your order. Follow its progress in My orders. Pay at the cashier.</p><nav className="mt-4 flex flex-wrap gap-2" aria-label="Menu categories">{categories.map(([cat],i)=><a key={cat} className="btn btn-ghost text-sm" href={`#category-${i}`}>{cat}</a>)}</nav></div>
        {categories.map(([cat, items],index) => (
          <section id={`category-${index}`} className="scroll-mt-44" key={cat}>
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
          <p className="text-center text-muted">{hub ? "No menu items available. Please ask staff." : "Loading menu…"}</p>
        ) : null}
        </>}
      </main>

      {/* Bottom-docked cart — flex footer, not fixed (avoids mid-viewport on Pages) */}
      <div className="sticky bottom-0 z-30 shrink-0 border-t border-line bg-white/95 backdrop-blur shadow-[0_-8px_30px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-2xl px-4 py-3 space-y-2">
          {view==='orders' && lines.length===0 ? <button className="btn btn-accent w-full" onClick={()=>setView('menu')}>Add more items</button> : <>
          {lines.length > 0 ? (
            <div className="motion-tile space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{count} item{count === 1 ? '' : 's'}</span>
                <span key={count} className="motion-chip font-bold tabular-nums">{money(total)}</span>
              </div>
              <ul className="max-h-32 overflow-auto text-sm">{lines.map(line=><li key={line.id} className="flex items-center justify-between gap-3 py-1"><span>{line.qty} × {line.name}</span><QtyStepper value={line.qty} onChange={qty=>setQty(line,qty)} min={0} /></li>)}</ul>
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
            disabled={lines.length === 0 || sending || !table || !connected || hub?.cafeOnline === false}
            onClick={send}
          >
            {sending ? 'Sending…' : 'Send to kitchen'}
          </button>
          </>}
        </div>
      </div>

      {toast ? (
        <div role="status" className="motion-toast fixed left-1/2 top-24 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
