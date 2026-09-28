import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { HubHello, MenuItem, Order } from '../lib/types';

let shared: Socket | null = null;

// Module-level cache so late-mounted pages see last known state
let cachedHub: HubHello | null = null;
let cachedMenu: MenuItem[] = [];
let cachedOrders: Order[] = [];

function getSocket(): Socket {
  if (!shared) {
    shared = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return shared;
}

export function useSocket() {
  const socketRef = useRef<Socket>(getSocket());
  const [connected, setConnected] = useState(socketRef.current.connected);
  const [hub, setHub] = useState<HubHello | null>(cachedHub);
  const [menu, setMenu] = useState<MenuItem[]>(cachedMenu);
  const [orders, setOrders] = useState<Order[]>(cachedOrders);

  useEffect(() => {
    const s = socketRef.current;

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

    // Hydrate if we missed the initial push (late mount / HMR)
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

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('hub:hello', onHello);
      s.off('menu:updated', onMenu);
      s.off('order:new', onNew);
      s.off('order:updated', onUpdated);
      s.off('table:cleared', onCleared);
    };
  }, []);

  const createOrder = useCallback(
    (tableId: string, items: { id: string; qty: number }[], note?: string) => {
      return new Promise<{ ok: boolean; order?: Order; error?: string }>((resolve) => {
        socketRef.current.emit('order:create', { tableId, items, note }, (ack: { ok: boolean; order?: Order; error?: string }) => {
          resolve(ack || { ok: false, error: 'No ack' });
        });
      });
    },
    []
  );

  const setStatus = useCallback((orderId: string, status: string) => {
    return new Promise<{ ok: boolean; order?: Order; error?: string }>((resolve) => {
      socketRef.current.emit('order:status', { orderId, status }, (ack: { ok: boolean; order?: Order; error?: string }) => {
        resolve(ack || { ok: false, error: 'No ack' });
      });
    });
  }, []);

  const clearTable = useCallback((tableId: string) => {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      socketRef.current.emit('table:clear', { tableId }, (ack: { ok: boolean; error?: string }) => {
        resolve(ack || { ok: false, error: 'No ack' });
      });
    });
  }, []);

  return {
    socket: socketRef.current,
    connected,
    hub,
    menu,
    orders,
    createOrder,
    setStatus,
    clearTable,
  };
}
