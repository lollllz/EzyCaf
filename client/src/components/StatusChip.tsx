import type { OrderStatus } from '../lib/types';

const COLORS: Record<Exclude<OrderStatus, 'paid'>, string> = {
  pending: '#D97706',
  cooking: '#2563EB',
  ready: '#16A34A',
};

export default function StatusChip({ status }: { status: OrderStatus }) {
  if (status === 'paid') {
    return (
      <span key="paid" className="chip motion-chip bg-muted/80">
        Paid
      </span>
    );
  }
  return (
    <span
      key={status}
      className="chip motion-chip"
      style={{ background: COLORS[status] }}
    >
      {status}
    </span>
  );
}
