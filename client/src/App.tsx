import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSocket } from './hooks/useSocket';
import DemoBanner from './components/DemoBanner';
import HubPage from './pages/HubPage';
import CustomerPage from './pages/CustomerPage';
import KitchenPage from './pages/KitchenPage';
import CashierPage from './pages/CashierPage';
import SetupPage from './pages/SetupPage';
import AdminPage from './pages/AdminPage';

export default function App() {
  const { hub, isDemo, connected } = useSocket();
  const location = useLocation();
  const [needsSetup, setNeedsSetup] = useState(false);
  useEffect(() => {
    if (import.meta.env.VITE_DEMO === 'true') return;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return;
    fetch('/api/setup').then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((s) => setNeedsSetup(!s.complete)).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    const accent = hub?.brand?.accent || '#0F766E';
    document.documentElement.style.setProperty('--accent', accent);
    if (hub?.brand?.name) document.title = hub.brand.name;
  }, [hub]);

  if (hub?.networkMode === 'customer-relay' && !location.pathname.startsWith('/t/')) return <main className="p-8">Staff access works only on the cafe network. Scan your table QR for the customer menu.</main>;

  return (
    <>
      {isDemo ? <DemoBanner /> : null}
      {!isDemo && !connected ? <div role="status" className="border-b border-amber-200 bg-amber-50 p-3 text-center text-sm">{hub?.networkMode === 'customer-relay' ? 'Reconnecting to the cafe ordering service. Check your internet connection.' : 'Connecting to the cafe hub. Stay on the cafe Wi-Fi; live actions need a connection.'}</div> : null}
      {needsSetup && location.pathname !== '/setup' ? <Navigate to="/setup" replace /> : null}
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/" element={<HubPage />} />
        <Route path="/t/:tableId" element={<CustomerPage />} />
        <Route path="/kitchen" element={<KitchenPage />} />
        <Route path="/cashier" element={<CashierPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </>
  );
}
