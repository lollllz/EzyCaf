import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('EzyCaf');
  const [accent, setAccent] = useState('#215C47');
  const [tableCount, setTableCount] = useState(4);
  const [minimum, setMinimum] = useState(1);
  const [baseUrl, setBaseUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [serviceUrl, setServiceUrl] = useState('');
  const [pairToken, setPairToken] = useState('');
  const [paired, setPaired] = useState(false);
  const [publicMode, setPublicMode] = useState(false);
  const isDemo = import.meta.env.VITE_DEMO === 'true';
  const onHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  useEffect(() => {
    if (isDemo) return;
    fetch('/api/setup').then(async (r) => { if (!r.ok) throw new Error('Connect to the cafe hub to begin setup.'); return r.json(); })
      .then((s) => { setName(s.name); setBaseUrl(s.baseUrl); setServiceUrl(s.customerService?.url || ''); setPaired(!!s.customerService?.url); setPublicMode(!!s.customerService?.url); setMinimum(Math.max(1, s.tables.length)); setTableCount(Math.max(4, s.tables.length)); })
      .catch((e) => setError(e.message));
  }, [isDemo]);
  async function finish() {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, accent, tableCount }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup could not be saved');
      setBaseUrl(data.baseUrl); setStep(3);
    } catch (e) { setError(e instanceof Error ? e.message : 'Setup failed'); }
    finally { setSaving(false); }
  }
  async function pairService() {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/setup/customer-service', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: serviceUrl, token: pairToken }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pairing failed');
      setPairToken(''); setPaired(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Pairing failed'); }
    finally { setSaving(false); }
  }
  async function unpairService() {
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/setup/customer-service', { method: 'DELETE' });
      if (!res.ok) throw new Error('Unpairing failed');
      setPaired(false); setServiceUrl('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unpairing failed'); }
    finally { setSaving(false); }
  }
  const titles = ['Welcome to your cafe.', 'Make it yours.', 'Connect your devices.', 'Ready for the first order.'];
  return <main className="min-h-screen bg-[#F7F5EF] px-4 py-8 sm:py-14">
    <div className="mx-auto max-w-xl">
      <p className="mb-8 text-2xl font-bold text-[#183C32]">EzyCaf</p>
      <div className="mb-6 flex gap-2" aria-label={`Setup step ${Math.min(step + 1, 3)} of 3`}>
        {[0, 1, 2].map((i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-[#215C47]' : 'bg-[#E3E7DF]'}`} />)}
      </div>
      <section className="card space-y-6 p-6 sm:p-8">
        <h1 className="text-3xl font-bold tracking-tight text-[#183C32]">{titles[step]}</h1>
        {step === 0 ? <>
          <p>Set up this computer as your cafe hub. It keeps your menu and orders and connects your phones, cashier and kitchen.</p>
          <ol className="list-decimal space-y-3 pl-5 text-muted"><li>Keep this computer switched on during service.</li><li>The cafe needs a Wi-Fi router/local network. Connect the hub and staff devices to it.</li><li>Allow EzyCaf on private networks when your firewall asks.</li></ol>
          <p className="rounded-xl bg-green-50 p-4 text-sm">Staff access stays on the cafe network. The Android staff app requires cafe Wi-Fi. Customers use a browser and table QR; mobile-data ordering needs the optional public customer service.</p>
        </> : null}
        {step === 1 ? <>
          <label className="block">Cafe name<input className="input mt-2" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block">Brand colour<input className="mt-2 block h-12 w-full rounded-xl" type="color" value={accent} onChange={(e) => setAccent(e.target.value)} /></label>
          <label className="block">Number of tables<input className="input mt-2" type="number" min={minimum} max={100} value={tableCount} onChange={(e) => setTableCount(Number(e.target.value))} /></label>
          <p className="text-sm text-muted">Existing tables and order history are preserved. You can add tables here.</p>
        </> : null}
        {step === 2 ? <>
          <p>Open this address on a phone or tablet connected to the cafe Wi-Fi, or enter it in the Android app setup.</p>
          <p className="break-all rounded-xl bg-[#E7EEE7] p-4 font-mono text-lg">{baseUrl || 'Waiting for the hub address…'}</p>
          <p className="text-sm text-muted">If it starts with 127.0.0.1, connect this computer to your cafe network first. Guest Wi-Fi isolation can prevent devices from connecting.</p>
          <ul className="list-disc space-y-2 pl-5"><li>Kitchen device: choose Kitchen.</li><li>Cashier device: choose Cashier.</li><li>Customers: scan a table QR from the hub.</li></ul>
          <p className="rounded-xl bg-amber-50 p-4 text-sm">Without the optional customer service, guests must join cafe Wi-Fi to order. Add a guest-network QR beside the table QR to make joining easier. Internet is not needed for local ordering.</p>
          <p className="text-sm text-muted">Reserve this computer’s address in your router so printed table QR codes keep working.</p>
        </> : null}
        {step === 3 ? <><section className="space-y-4 border-b border-line pb-6">
          <h2 className="text-xl font-semibold">Choose customer access</h2>
          <label className="flex items-start gap-3"><input className="mt-1 h-5 w-5" type="radio" checked={!publicMode} onChange={() => setPublicMode(false)} /><span><strong>Local only</strong><span className="block text-sm text-muted">No hosting cost or internet required. Customers must join cafe Wi-Fi; display guest-network instructions beside the QR.</span></span></label>
          <label className="flex items-start gap-3"><input className="mt-1 h-5 w-5" type="radio" checked={publicMode} onChange={() => setPublicMode(true)} /><span><strong>Public customer ordering</strong><span className="block text-sm text-muted">Mobile data works for customers. You choose the hosting provider, domain and plan; the hub needs internet. Staff stays local.</span></span></label>
          {publicMode ? <a className="btn btn-ghost w-full" href="/api/setup/deployment-bundle" download>Download customer service bundle</a> : null}
          <p className="text-sm text-muted">Optional. Deploy the customer service first, then pair it here. It needs internet on the hub, HTTPS hosting, and a unique pairing token. Kitchen, cashier and admin remain local. If the service is down, use cafe Wi-Fi and ask staff for the local table link.</p>
          {paired ? <><p className="break-all text-sm">Paired customer address: {serviceUrl}</p><button className="btn btn-ghost" disabled={saving} onClick={() => void unpairService()}>Disconnect customer service</button></> : publicMode ? <>
            <label className="block">Customer service address<input className="input mt-2" type="url" placeholder="https://order.your-cafe.example" value={serviceUrl} onChange={(e) => setServiceUrl(e.target.value)} /></label>
            <label className="block">Pairing token<input className="input mt-2" type="password" autoComplete="off" value={pairToken} onChange={(e) => setPairToken(e.target.value)} /></label>
            <button className="btn btn-ghost w-full" disabled={saving || !onHost || !serviceUrl || pairToken.length < 32} onClick={() => void pairService()}>Test connection & pair</button>
          </> : <p className="text-sm text-muted">You can enable public ordering later by returning to Setup guide.</p>}
        </section><p>Your settings are saved. Add your own menu, review the sample items, then test an order through the kitchen and cashier before service.</p><div className="flex flex-wrap gap-3"><Link className="btn btn-accent" to="/admin">Set up the menu</Link><Link className="btn btn-ghost" to="/">Open table hub</Link></div></> : null}
        {isDemo ? <p role="alert" className="text-amber-800">This preview cannot configure a database. Run the EzyCaf hub program.</p> : null}
        {!onHost ? <p className="text-amber-800">Finish setup on the host computer using its localhost address. This device can use the table hub after setup.</p> : null}
        {error ? <p role="alert" className="text-red-700">{error}</p> : null}
        {step < 3 ? <div className="flex gap-3">
          {step > 0 ? <button className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={saving}>Back</button> : null}
          <button className="btn btn-accent flex-1" disabled={saving || isDemo || !onHost || !name.trim() || !Number.isInteger(tableCount) || tableCount < minimum || tableCount > 100} onClick={() => step < 2 ? setStep(step + 1) : void finish()}>{saving ? 'Saving…' : step === 2 ? 'Finish setup' : 'Continue'}</button>
        </div> : null}
      </section>
    </div>
  </main>;
}
