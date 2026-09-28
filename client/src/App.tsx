import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useSocket } from './hooks/useSocket';
import HubPage from './pages/HubPage';
import CustomerPage from './pages/CustomerPage';
import KitchenPage from './pages/KitchenPage';
import CashierPage from './pages/CashierPage';
import AdminPage from './pages/AdminPage';

export default function App() {
  const { hub } = useSocket();

  useEffect(() => {
    const accent = hub?.brand?.accent || '#0F766E';
    document.documentElement.style.setProperty('--accent', accent);
    if (hub?.brand?.name) document.title = hub.brand.name;
  }, [hub]);

  return (
    <Routes>
      <Route path="/" element={<HubPage />} />
      <Route path="/t/:tableId" element={<CustomerPage />} />
      <Route path="/kitchen" element={<KitchenPage />} />
      <Route path="/cashier" element={<CashierPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}
