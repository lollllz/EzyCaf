/**
 * Optional menu sync to Supabase. Never blocks LAN operations.
 * Off by default. Fire-and-forget when enabled.
 */

export async function syncMenuToSupabase(settings, menu) {
  if (!settings.supabaseSync) return { ok: false, reason: 'sync_off' };
  if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
    return { ok: false, reason: 'missing_credentials' };
  }

  const url = settings.supabaseUrl.replace(/\/$/, '');
  const endpoint = `${url}/rest/v1/menu_items`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    // Upsert rows — expects a public menu_items table with matching columns
    const rows = menu.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      price: m.price,
      category: m.category,
      available: m.available,
      sort_order: m.sortOrder,
    }));

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: settings.supabaseAnonKey,
        Authorization: `Bearer ${settings.supabaseAnonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, reason: `http_${res.status}`, detail: text.slice(0, 200) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? 'timeout' : 'network', detail: String(err.message || err) };
  }
}
