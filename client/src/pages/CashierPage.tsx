import { Link } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import StatusChip from '../components/StatusChip';
import { money } from '../lib/format';
import type { Order } from '../lib/types';

export default function CashierPage() {
  const { hub, orders, clearTable, connected } = useSocket();

  const tables = hub?.tables || [];

  function ordersFor(tableId: string): Order[] {
    return orders.filter((o) => o.tableId === tableId && o.status !== 'paid');
  }

  async function pay(tableId: string) {
    await clearTable(tableId);
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-line bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Cashier</h1>
          <p className="text-sm text-muted">
            {hub?.brand?.name || 'Kamil'} · {connected ? 'Live' : '…'}
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link className="btn btn-ghost" to="/">Hub</Link>
          <Link className="btn btn-ghost" to="/kitchen">Kitchen</Link>
          <Link className="btn btn-ghost" to="/admin">Admin</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tables.map((t) => {
            const list = ordersFor(t.id);
            const total = list.reduce((s, o) => s + o.total, 0);
            const open = list.length > 0;
            return (
              <article key={t.id} className="motion-fade card flex flex-col p-5">
                <div className="mb-3 flex items-start justify-between">
                  <h2 className="text-lg font-bold">{t.label}</h2>
                  {open ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ background: 'var(--accent)' }}
                    >
                      Open
                    </span>
                  ) : (
                    <span className="rounded-full bg-line px-2 py-0.5 text-xs font-semibold text-muted">
                      Empty
                    </span>
                  )}
                </div>

                {open ? (
                  <ul className="mb-4 flex-1 space-y-3">
                    {list.map((o) => (
                      <li key={o.id} className="rounded-xl bg-cream/80 p-3 text-sm">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <StatusChip status={o.status} />
                          <span className="font-semibold tabular-nums">{money(o.total)}</span>
                        </div>
                        <p className="text-muted">
                          {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-4 flex-1 text-sm text-muted">No open orders</p>
                )}

                <div className="mt-auto border-t border-line pt-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-muted">Total</span>
                    <span className="text-xl font-bold tabular-nums">{money(total)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost flex-1"
                      disabled={!open}
                      onClick={() => pay(t.id)}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="btn btn-accent flex-1"
                      disabled={!open}
                      onClick={() => pay(t.id)}
                    >
                      Pay
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
