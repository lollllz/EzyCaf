import { useEffect, useState } from 'react';
import type { Order } from '../lib/types';
import { money } from '../lib/format';
export type Receipt = { id: string; token: string; order?: Order };
const stages = ['pending', 'cooking', 'ready', 'served', 'paid'];
const labels: Record<string,string> = { pending:'Received', cooking:'Preparing', ready:'Ready for pickup', served:'Served', paid:'Paid' };
export default function CustomerOrders({ receipts, connected }: { receipts:Receipt[]; connected:boolean }) {
  const [orders,setOrders] = useState<Record<string,Order>>({});
  const [paused,setPaused] = useState(false);
  useEffect(() => {
    if (!receipts.length) return;
    const controller=new AbortController(); let running=false;
    async function refresh() {
      if (running) return; running=true;
      const results=await Promise.allSettled(receipts.map(async r=>{
        const response=await fetch(`/api/customer/orders/${encodeURIComponent(r.id)}`,{ headers:{'X-Order-Receipt':r.token},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)]),cache:'no-store' });
        if (!response.ok) throw new Error('Unavailable');
        return await response.json() as Order;
      }));
      if (!controller.signal.aborted) {
        setPaused(results.some(r=>r.status==='rejected'));
        setOrders(previous=>{const next={...previous};for(const result of results) if(result.status==='fulfilled') next[result.value.id]=result.value;return next;});
      }
      running=false;
    }
    void refresh(); const timer=setInterval(()=>void refresh(),3000);
    return ()=>{clearInterval(timer);controller.abort();};
  },[receipts]);
  return <section aria-label="Your orders" className="space-y-4">
    <div><h2 className="text-2xl font-bold">Your orders</h2><p className="mt-1 text-sm text-muted">Follow your food from the kitchen to your table. Payment is recorded by the cashier.</p></div>
    {!connected || paused ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Updates are paused. Showing the last known status; reconnect or ask staff.</p> : receipts.length ? <p className="text-xs text-muted">Status updates automatically every few seconds.</p> : null}
    {!receipts.length ? <div className="card p-6"><h3 className="font-semibold">Nothing ordered yet</h3><p className="mt-2 text-sm text-muted">Choose your food from the menu. Your order receipt and progress will appear here after sending.</p></div> : null}
    {[...receipts].reverse().map(receipt=>{
      const order=orders[receipt.id] || receipt.order;
      if (!order) return <p key={receipt.id} className="card p-4">Waiting for your receipt. Please ask staff if confirmation is delayed.</p>;
      const stage=stages.indexOf(order.status);
      return <article key={`${order.id}-${order.status}`} className="card motion-tile p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted">Order {order.id.slice(-8)}</p><h3 className="mt-1 text-lg font-bold" role="status">{labels[order.status]}</h3><p className="mt-1 text-xs text-muted">{new Date(order.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p></div><span className="font-bold tabular-nums">{money(order.total)}</span></div>
        <ol aria-label="Order progress" className="my-5 grid grid-cols-5 gap-1">{stages.map((s,i)=><li key={s} aria-current={stage===i?'step':undefined} className="text-center"><div className="h-1.5 rounded-full bg-line" style={i<=stage?{background:'var(--accent)'}:undefined} /><span className="mt-2 block text-[10px] leading-tight">{s==='pending'?'Received':s==='cooking'?'Preparing':s==='ready'?'Ready':labels[s]}</span></li>)}</ol>
        <ul className="space-y-2 text-sm">{order.items.map(item=><li key={item.id} className="flex justify-between gap-3"><span>{item.qty} × {item.name}</span><span>{money(item.lineTotal)}</span></li>)}</ul>
        {order.note ? <p className="mt-3 rounded-xl bg-cream p-3 text-sm">Kitchen note: {order.note}</p>:null}
        <p className="mt-4 border-t border-line pt-3 text-sm text-muted">{order.status==='paid'?'Payment recorded. Thank you!':order.status==='ready'?'Your food is ready. Staff will serve it or call you for pickup.':order.status==='served'?'Enjoy your meal. Your bill is still available at the cashier.':'Your order is with the kitchen. Please ask staff if you need to change it.'}</p>
      </article>;
    })}
    {receipts.length ? <p className="text-xs text-muted">Receipts are saved in this browser on this device. Clearing browser data removes access here.</p>:null}
  </section>;
}
