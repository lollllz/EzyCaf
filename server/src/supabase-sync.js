/** Optional cloud replication. Local SQLite remains authoritative. */
export async function syncMenuToSupabase(settings, menu, deletedIds = []) {
  if (!settings.supabaseSync) return { ok: false, reason: 'sync_off' };
  if (!settings.supabaseUrl || !settings.supabaseAnonKey) return { ok: false, reason: 'missing_credentials' };
  const endpoint = `${settings.supabaseUrl.replace(/\/$/, '')}/rest/v1/menu_items`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const headers = {
    apikey: settings.supabaseAnonKey,
    Authorization: `Bearer ${settings.supabaseAnonKey}`,
    'Content-Type': 'application/json',
  };
  try {
    // Delete only explicitly removed IDs; never wipe unrelated cloud rows.
    for (const id of deletedIds) {
      const query = new URLSearchParams({ id: `eq.${id}` });
      const response = await fetch(`${endpoint}?${query}`, { method: 'DELETE', headers, signal: controller.signal });
      if (!response.ok) return { ok: false, reason: `delete_http_${response.status}` };
      // RLS can silently affect zero rows. Confirm the row is no longer visible.
      const check = await fetch(`${endpoint}?${new URLSearchParams({ id: `eq.${id}`, select: 'id' })}`, { headers, signal: controller.signal });
      if (!check.ok) return { ok: false, reason: `verify_http_${check.status}` };
      if ((await check.json()).length) return { ok: false, reason: 'delete_not_applied' };
    }
    if (menu.length) {
      const rows = menu.map((m) => ({ id: m.id, name: m.name, description: m.description, price: m.price, category: m.category, available: m.available, sort_order: m.sortOrder }));
      const response = await fetch(endpoint, {
        method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(rows), signal: controller.signal,
      });
      if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
