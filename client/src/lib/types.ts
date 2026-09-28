export type OrderStatus = 'pending' | 'cooking' | 'ready' | 'paid';

export interface Brand {
  name: string;
  accent: string;
  logoUrl: string;
}

export interface TableInfo {
  id: string;
  label: string;
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  available: boolean;
  sortOrder: number;
}

export interface OrderLine {
  id: string;
  name: string;
  price: number;
  qty: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  tableId: string;
  status: OrderStatus;
  items: OrderLine[];
  total: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface HubHello {
  tables: TableInfo[];
  baseUrl: string;
  brand: Brand;
}

export interface Settings {
  name: string;
  accent: string;
  logoUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseSync: boolean;
  lastSynced: string;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}
