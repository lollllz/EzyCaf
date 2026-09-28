import { Link } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import StatusChip from '../components/StatusChip';
import { timeAgo } from '../lib/format';
import type { Order, OrderStatus } from '../lib/types';

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'cooking',
  cooking: 'ready',
};

export default function KitchenPage() {
  const { hub, orders, setStatus, connected } = useSocket();

  const active = orders.filter((o) => o.status !== 'paid');
  const byStatus = {
    pending: active.filter((o) => o.status === 'pending'),
    cooking: active.filter((o) => o.status === 'cooking'),
    ready: active.filter((o) => o.status === 'ready'),
  };

  function tableLabel(id: string) {
    return hub?.tables.find((t) => t.id === id)?.label || id;
  }

  async function bump(order: Order) {
    const next = NEXT[order.status];
    if (next) await setStatus(order.id, next);
  }

  return (
    <div className="min-h-screen bg-kds-bg text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Kitchen Display</h1>
          <p className="text-sm text-white/50">
            {hub?.brand?.name || 'Kamil'} · {connected ? 'Live' : 'Reconnecting…'}
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link className="rounded-xl bg-white/10 px-4 py-2.5 font-medium hover:bg-white/15" to="/">Hub</Link>
          <Link className="rounded-xl bg-white/10 px-4 py-2.5 font-medium hover:bg-white/15" to="/cashier">Cashier</Link>
        </nav>
      </header>

      <main className="grid gap-4 p-4 lg:grid-cols-3">
        {(['pending', 'cooking', 'ready'] as const).map((col) => (
          <section key={col} className="min-h-[40vh]">
            <div className="mb-3 flex items-center gap-2 px-1">
              <StatusChip status={col} />
              <span className="text-sm text-white/40">{byStatus[col].length}</span>
            </div>
            <div className="space-y-3">
              {byStatus[col].map((order) => (
                <article
                  key={order.id}
                  className="motion-tile rounded-2xl bg-kds-surface border border-white/5 p-4 shadow-lg"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold">{tableLabel(order.tableId)}</p>
                      <p className="text-xs text-white/40">{timeAgo(order.createdAt)} ago</p>
                    </div>
                    <StatusChip status={order.status} />
                  </div>
                  <ul className="space-y-1.5 text-base">
                    {order.items.map((it, i) => (
                      <li key={`${order.id}-${i}`} className="flex justify-between gap-2">
                        <span>
                          <span className="font-bold tabular-nums text-white/90">{it.qty}×</span>{' '}
                          {it.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {order.note ? (
                    <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-sm text-amber-200/90">
                      Note: {order.note}
                    </p>
                  ) : null}
                  {NEXT[order.status] ? (
                    <button
                      type="button"
                      className="mt-4 flex h-12 w-full items-center justify-center rounded-xl text-base font-semibold text-white"
                      style={{
                        background:
                          order.status === 'pending'
                            ? '#2563EB'
                            : order.status === 'cooking'
                              ? '#16A34A'
                              : '#374151',
                      }}
                      onClick={() => bump(order)}
                    >
                      {order.status === 'pending' ? 'Start cooking' : 'Mark ready'}
                    </button>
                  ) : (
                    <p className="mt-4 text-center text-sm font-medium text-status-ready">
                      Waiting for pickup
                    </p>
                  )}
                </article>
              ))}
              {byStatus[col].length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/30">
                  No tickets
                </p>
              ) : null}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
