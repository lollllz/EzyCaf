import type { Brand, HubHello, MenuItem, Order, OrderLine, TableInfo } from './types';

export const DEMO_BRAND: Brand = {
  name: 'Kamil Demo',
  accent: '#0F766E',
  logoUrl: '',
};

export const DEMO_TABLES: TableInfo[] = [
  { id: 't1', label: 'Table 1', sortOrder: 1 },
  { id: 't2', label: 'Table 2', sortOrder: 2 },
  { id: 't3', label: 'Table 3', sortOrder: 3 },
  { id: 't4', label: 'Table 4', sortOrder: 4 },
];

export const DEMO_MENU: MenuItem[] = [
  {
    id: 'm1',
    name: 'Nasi Lemak',
    description: 'Coconut rice, sambal, egg, peanuts, anchovies',
    price: 12.5,
    category: 'Mains',
    available: true,
    sortOrder: 1,
  },
  {
    id: 'm2',
    name: 'Chicken Rice',
    description: 'Hainanese chicken, fragrant rice, soup',
    price: 11.0,
    category: 'Mains',
    available: true,
    sortOrder: 2,
  },
  {
    id: 'm3',
    name: 'Mee Goreng',
    description: 'Spicy fried noodles with prawns',
    price: 13.0,
    category: 'Mains',
    available: true,
    sortOrder: 3,
  },
  {
    id: 'm4',
    name: 'Satay Skewers',
    description: '6 skewers with peanut sauce',
    price: 10.0,
    category: 'Starters',
    available: true,
    sortOrder: 4,
  },
  {
    id: 'm5',
    name: 'Roti Canai',
    description: 'Flaky flatbread with curry',
    price: 4.5,
    category: 'Starters',
    available: true,
    sortOrder: 5,
  },
  {
    id: 'm6',
    name: 'Teh Tarik',
    description: 'Pulled milk tea',
    price: 3.5,
    category: 'Drinks',
    available: true,
    sortOrder: 6,
  },
  {
    id: 'm7',
    name: 'Fresh Lime Juice',
    description: 'Iced lime with mint',
    price: 4.0,
    category: 'Drinks',
    available: true,
    sortOrder: 7,
  },
  {
    id: 'm8',
    name: 'Cendol',
    description: 'Shaved ice, coconut milk, palm sugar',
    price: 6.5,
    category: 'Desserts',
    available: true,
    sortOrder: 8,
  },
];

function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function line(id: string, name: string, price: number, qty: number): OrderLine {
  return { id, name, price, qty, lineTotal: price * qty };
}

export function seedDemoOrders(): Order[] {
  const o1Items = [line('m1', 'Nasi Lemak', 12.5, 2), line('m6', 'Teh Tarik', 3.5, 2)];
  const o2Items = [line('m4', 'Satay Skewers', 10.0, 1), line('m5', 'Roti Canai', 4.5, 2)];
  return [
    {
      id: 'demo-o1',
      tableId: 't1',
      status: 'pending',
      items: o1Items,
      total: o1Items.reduce((s, i) => s + i.lineTotal, 0),
      note: 'Less spicy please',
      createdAt: nowIso(-4 * 60_000),
      updatedAt: nowIso(-4 * 60_000),
    },
    {
      id: 'demo-o2',
      tableId: 't2',
      status: 'cooking',
      items: o2Items,
      total: o2Items.reduce((s, i) => s + i.lineTotal, 0),
      note: '',
      createdAt: nowIso(-12 * 60_000),
      updatedAt: nowIso(-3 * 60_000),
    },
  ];
}

export function demoHubHello(): HubHello {
  const base =
    typeof window !== 'undefined'
      ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`
      : 'https://lollllz.github.io/kamil';
  return {
    tables: DEMO_TABLES,
    baseUrl: base,
    brand: DEMO_BRAND,
  };
}

export function isForceDemo(): boolean {
  return import.meta.env.VITE_DEMO === 'true';
}

/** Probe /api/hub with a short timeout; true means fall back to demo. */
export async function detectHubUnavailable(timeoutMs = 1200): Promise<boolean> {
  if (isForceDemo()) return true;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/hub', { signal: ctrl.signal });
    return !res.ok;
  } catch {
    return true;
  } finally {
    clearTimeout(timer);
  }
}

let orderSeq = 3;

export function nextDemoOrderId(): string {
  const id = `demo-o${orderSeq}`;
  orderSeq += 1;
  return id;
}
