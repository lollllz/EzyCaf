import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncMenuToSupabase } from '../src/supabase-sync.js';
const settings = { supabaseSync: true, supabaseUrl: 'https://test.invalid', supabaseAnonKey: 'test-only' };
test('cloud sync deletes only explicit IDs, verifies deletion, and handles an empty menu', async () => {
  const calls = []; const original = global.fetch;
  global.fetch = async (url, options) => { calls.push([url, options.method || 'GET']); return new Response(options.method === 'DELETE' ? '' : '[]', { status: 200 }); };
  try { assert.equal((await syncMenuToSupabase(settings, [], ['m&1'])).ok, true); assert.equal(calls.length, 2); assert.equal(new URL(calls[0][0]).searchParams.get('id'), 'eq.m&1'); assert.equal(calls[0][1], 'DELETE'); }
  finally { global.fetch = original; }
});
test('cloud policy that leaves the row visible is not reported as success', async () => {
  const original = global.fetch;
  global.fetch = async (_url, options) => new Response(options.method === 'DELETE' ? '' : '[{"id":"m1"}]', { status: 200 });
  try { assert.equal((await syncMenuToSupabase(settings, [], ['m1'])).reason, 'delete_not_applied'); }
  finally { global.fetch = original; }
});
test('cloud failures remain failures so callers retain durable tombstones', async () => {
  const original = global.fetch; global.fetch = async () => new Response('', { status: 403 });
  try { assert.equal((await syncMenuToSupabase(settings, [], ['m1'])).reason, 'delete_http_403'); }
  finally { global.fetch = original; }
});
