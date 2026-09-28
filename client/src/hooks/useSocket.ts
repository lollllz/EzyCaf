import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { HubHello, MenuItem, Order, OrderStatus } from '../lib/types';
import {
  DEMO_MENU,
  detectHubUnavailable,
  demoHubHello,
  isForceDemo,
  nextDemoOrderId,
  seedDemoOrders,
} from '../lib/demo';

let shared: Socket | null = null;

// Module-level cache so late-mounted pages see last known state
let cachedHub: HubHello | null = null;
let cachedMenu: MenuItem[] = [];
let cachedOrders: Order[] = [];
let demoMode = false;
let demoReady = false;
let demoInitPromise: Promise<boolean> | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

function enterDemoMode() {
  demoMode = true;
  cachedHub = demoHubHello();
  cachedMenu = DEMO_MENU.map((m) => ({ ...m }));
  if (cachedOrders.length === 0) {
    cachedOrders = seedDemoOrders();
  }
  demoReady = true;
  notify();
}

async function ensureMode(): Promise<boolean> {
  if (demoReady) return demoMode;
  if (demoInitPromise) return demoInitPromise;
  demoInitPromise = (async () => {
    if (isForceDemo()) {
      enterDemoMode();
      return true;
    }
    const unavailable = await detectHubUnavailable();
    if (unavailable) {
      enterDemoMode();
      return true;
    }
    demoReady = true;
    demoMode = false;
    return false;
  })();
  return demoInitPromise;
}

function getSocket(): Socket | null {
  if (demoMode || isForceDemo()) return null;
  if (!shared) {
    shared = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return shared;
}

function demoCreateOrder(
  tableId: string,
  items: { id: string; qty: number }[],
  note?: string
): { ok: boolean; order?: Order; error?: string } {
  const lines = items
    .map(({ id, qty }) => {
      const m = cachedMenu.find((x) => x.id === id);
      if (!m || qty <= 0) return null;
      return {
        id: m.id,
        name: m.name,
        price: m.price,
        qty,
        lineTotal: m.price * qty,
      };
    })
    .filter(Boolean) as Order['items'];

  if (lines.length === 0) return { ok: false, error: 'No items' };
  if (!cachedHub?.tables.some((t) => t.id === tableId)) {
    return { ok: false, error: 'Unknown table' };
  }

  const now = new Date().toISOString();
  const order: Order = {
    id: nextDemoOrderId(),
    tableId,
    status: 'pending',
    items: lines,
    total: lines.reduce((s, l) => s + l.lineTotal, 0),
    note: note || '',
    createdAt: now,
    updatedAt: now,
  };
  cachedOrders = [...cachedOrders, order];
  notify();
  return { ok: true, order };
}

function demoSetStatus(
  orderId: string,
  status: string
): { ok: boolean; order?: Order; error?: string } {
  const idx = cachedOrders.findIndex((o) => o.id === orderId);
  if (idx === -1) return { ok: false, error: 'Order not found' };
  const allowed: OrderStatus[] = ['pending', 'cooking', 'ready', 'paid'];
  if (!allowed.includes(status as OrderStatus)) {
    return { ok: false, error: 'Invalid status' };
  }
  const now = new Date().toISOString();
  const order: Order = {
    ...cachedOrders[idx],
    status: status as OrderStatus,
    updatedAt: now,
  };
  if (order.status === 'paid') {
    cachedOrders = cachedOrders.filter((o) => o.id !== orderId);
  } else {
    const next = [...cachedOrders];
    next[idx] = order;
    cachedOrders = next;
  }
  notify();
  return { ok: true, order };
}

function demoClearTable(tableId: string): { ok: boolean; error?: string } {
  cachedOrders = cachedOrders.filter((o) => o.tableId !== tableId);
  notify();
  return { ok: true };
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [isDemo, setIsDemo] = useState(demoMode || isForceDemo());
  const [hub, setHub] = useState<HubHello | null>(cachedHub);
  const [menu, setMenu] = useState<MenuItem[]>(cachedMenu);
  const [orders, setOrders] = useState<Order[]>(cachedOrders);

  useEffect(() => {
    let cancelled = false;
    let detachSocket: (() => void) | undefined;

    const syncFromCache = () => {
      setIsDemo(demoMode);
      setHub(cachedHub);
      setMenu(cachedMenu);
      setOrders(cachedOrders);
      if (demoMode) setConnected(true);
    };

    listeners.add(syncFromCache);

    (async () => {
      const demo = await ensureMode();
      if (cancelled) return;
      syncFromCache();

      if (demo) {
        setConnected(true);
        return;
      }

      const s = getSocket();
      socketRef.current = s;
      if (!s) return;

      const onConnect = () => setConnected(true);
      const onDisconnect = () => setConnected(false);
      const onHello = (data: HubHello) => {
        cachedHub = data;
        setHub(data);
      };
      const onMenu = (data: MenuItem[]) => {
        cachedMenu = data;
        setMenu(data);
      };
      const onNew = (order: Order) => {
        setOrders((prev) => {
          let next: Order[];
          if (prev.some((o) => o.id === order.id)) {
            next = prev.map((o) => (o.id === order.id ? order : o));
          } else {
            next = [...prev, order];
          }
          cachedOrders = next;
          return next;
        });
      };
      const onUpdated = (payload: Order | { type: string; orders: Order[] }) => {
        if (payload && 'type' in payload && payload.type === 'snapshot') {
          cachedOrders = payload.orders;
          setOrders(payload.orders);
          return;
        }
        const order = payload as Order;
        setOrders((prev) => {
          let next: Order[];
          if (order.status === 'paid') {
            next = prev.filter((o) => o.id !== order.id);
          } else {
            const idx = prev.findIndex((o) => o.id === order.id);
            if (idx === -1) next = [...prev, order];
            else {
              next = [...prev];
              next[idx] = order;
            }
          }
          cachedOrders = next;
          return next;
        });
      };
      const onCleared = ({ tableId }: { tableId: string }) => {
        setOrders((prev) => {
          const next = prev.filter((o) => o.tableId !== tableId);
          cachedOrders = next;
          return next;
        });
      };

      s.on('connect', onConnect);
      s.on('disconnect', onDisconnect);
      s.on('hub:hello', onHello);
      s.on('menu:updated', onMenu);
      s.on('order:new', onNew);
      s.on('order:updated', onUpdated);
      s.on('table:cleared', onCleared);

      if (s.connected) setConnected(true);

      if (!cachedHub) {
        fetch('/api/hub')
          .then((r) => r.json())
          .then((data: HubHello) => {
            cachedHub = data;
            setHub(data);
          })
          .catch(() => {});
      }
      if (cachedMenu.length === 0) {
        fetch('/api/menu')
          .then((r) => r.json())
          .then((data: MenuItem[]) => {
            cachedMenu = data;
            setMenu(data);
          })
          .catch(() => {});
      }
      if (cachedOrders.length === 0) {
        fetch('/api/orders/active')
          .then((r) => r.json())
          .then((data: Order[]) => {
            cachedOrders = data;
            setOrders(data);
          })
          .catch(() => {});
      }

      detachSocket = () => {
        s.off('connect', onConnect);
        s.off('disconnect', onDisconnect);
        s.off('hub:hello', onHello);
        s.off('menu:updated', onMenu);
        s.off('order:new', onNew);
        s.off('order:updated', onUpdated);
        s.off('table:cleared', onCleared);
      };
    })();

    return () => {
      cancelled = true;
      listeners.delete(syncFromCache);
      detachSocket?.();
    };
  }, []);

  const createOrder = useCallback(
    (tableId: string, items: { id: string; qty: number }[], note?: string) => {
      return new Promise<{ ok: boolean; order?: Order; error?: string }>((resolve) => {
        if (demoMode) {
          resolve(demoCreateOrder(tableId, items, note));
          return;
        }
        const s = socketRef.current || getSocket();
        if (!s) {
          resolve({ ok: false, error: 'Not connected' });
          return;
        }
        s.emit(
          'order:create',
          { tableId, items, note },
          (ack: { ok: boolean; order?: Order; error?: string }) => {
            resolve(ack || { ok: false, error: 'No ack' });
          }
        );
      });
    },
    []
  );

  const setStatus = useCallback((orderId: string, status: string) => {
    return new Promise<{ ok: boolean; order?: Order; error?: string }>((resolve) => {
      if (demoMode) {
        resolve(demoSetStatus(orderId, status));
        return;
      }
      const s = socketRef.current || getSocket();
      if (!s) {
        resolve({ ok: false, error: 'Not connected' });
        return;
      }
      s.emit(
        'order:status',
        { orderId, status },
        (ack: { ok: boolean; order?: Order; error?: string }) => {
          resolve(ack || { ok: false, error: 'No ack' });
        }
      );
    });
  }, []);

  const clearTable = useCallback((tableId: string) => {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      if (demoMode) {
        resolve(demoClearTable(tableId));
        return;
      }
      const s = socketRef.current || getSocket();
      if (!s) {
        resolve({ ok: false, error: 'Not connected' });
        return;
      }
      s.emit('table:clear', { tableId }, (ack: { ok: boolean; error?: string }) => {
        resolve(ack || { ok: false, error: 'No ack' });
      });
    });
  }, []);

  return {
    socket: socketRef.current,
    connected,
    isDemo,
    hub,
    menu,
    orders,
    createOrder,
    setStatus,
    clearTable,
  };
}
