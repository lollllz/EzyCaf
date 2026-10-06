import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import crypto from 'node:crypto';
import { io } from 'socket.io-client';
const root = fileURLToPath(new URL('../..', import.meta.url));
async function freePort() { const server = net.createServer(); await new Promise((r) => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise((r) => server.close(r)); return port; }
async function ready(url, headers) { for (let i=0;i<150;i++) { try { const r=await fetch(url, { headers }); if(r.ok) return; } catch {} await new Promise((r)=>setTimeout(r,100)); } throw new Error(`Service did not become ready: ${url}`); }
function start(script, env) { const child=spawn(process.execPath,[script],{ cwd:root, env:{...process.env,...env}, stdio:['ignore','ignore','pipe'] }); let errors=''; child.stderr.on('data',(s)=>{errors+=s;}); child.on('error',()=>{}); return { child, errors:()=>errors }; }
async function stop(child) { if(child.exitCode!==null || child.signalCode!==null) return; const done=new Promise((r)=>child.once('exit',r)); child.kill(); await done; }
function dbCommand(dir, source, extraEnv = {}) { return execFileSync(process.execPath,['--input-type=module','-e',`import db, * as store from './server/src/db.js'; store.initDb(); ${source}; db.close();`],{cwd:root,env:{...process.env,EZYCAF_DATA_DIR:dir,...extraEnv},encoding:'utf8'}); }
async function connected(socket) { if(socket.connected) return; await new Promise((resolve,reject)=>{ socket.once('connect',resolve); socket.once('connect_error',reject); }); }
function emit(socket,event,payload) { return new Promise((resolve,reject)=>socket.timeout(15000).emit(event,payload,(err,result)=>err?reject(err):resolve(result))); }

test('menu delete persists in SQLite, responds correctly, and stays empty on restart', async (t) => {
  const data=await mkdtemp(path.join(tmpdir(),'ezycaf-delete-')); const port=await freePort(); let hub;
  t.after(async()=>{if(hub) await stop(hub.child); await rm(data,{recursive:true,force:true});});
  const env={PORT:String(port),EZYCAF_DATA_DIR:data,EZYCAF_UPLOAD_DIR:path.join(data,'uploads')};
  hub=start('server/src/index.js',env); const base=`http://127.0.0.1:${port}`; await ready(base+'/api/health');
  const added=await (await fetch(base+'/api/menu',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Delete regression',price:5})})).json();
  assert.equal((await fetch(`${base}/api/menu/${added.id}`,{method:'DELETE'})).status,200);
  assert.equal((await fetch(`${base}/api/menu/${added.id}`,{method:'DELETE'})).status,404);
  assert.equal(JSON.parse(dbCommand(data,`console.log(JSON.stringify(store.getMenu()))`)).some(m=>m.id===added.id),false);
  const menu=await (await fetch(base+'/api/menu')).json(); for(const item of menu) await fetch(`${base}/api/menu/${item.id}`,{method:'DELETE'});
  assert.deepEqual(await (await fetch(base+'/api/menu')).json(),[]);
  await stop(hub.child); hub=start('server/src/index.js',env); await ready(base+'/api/health');
  assert.deepEqual(await (await fetch(base+'/api/menu')).json(),[]);
  assert.equal(JSON.parse(dbCommand(data,'console.log(JSON.stringify(store.getPendingMenuDeletions()))')).includes(added.id),true);
  const blocked=await fetch(base+'/api/menu',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'}); assert.equal(blocked.status,403);
  const invalid=await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Cafe',accent:'#215C47',tableCount:0})}); assert.equal(invalid.status,400);
  const setup=await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Cafe test',accent:'#215C47',tableCount:6})}); assert.equal(setup.status,200);
  assert.equal((await (await fetch(base+'/api/setup')).json()).complete,true);
});

test('public customer orders reach the private hub once; staff operations are denied', async(t)=>{
  const data=await mkdtemp(path.join(tmpdir(),'ezycaf-relay-'));const hubData=path.join(data,'hub');const relayPort=await freePort();const hubPort=await freePort();const token=crypto.randomBytes(32).toString('hex');
  dbCommand(hubData,`store.setSetting('relayUrl','http://127.0.0.1:${relayPort}');store.setSetting('relayToken',process.env.EZYCAF_TEST_RELAY_TOKEN)`, { EZYCAF_TEST_RELAY_TOKEN: token });
  const relay=start('relay/index.js',{PORT:String(relayPort),RELAY_DATA_DIR:path.join(data,'public'),RELAY_TOKEN:token});
  const headers={Authorization:`Bearer ${token}`}; const publicBase=`http://127.0.0.1:${relayPort}`; await ready(publicBase+'/relay/health',headers);
  const hub=start('server/src/index.js',{PORT:String(hubPort),EZYCAF_DATA_DIR:hubData,EZYCAF_UPLOAD_DIR:path.join(data,'uploads')});
  const socket=io(publicBase,{autoConnect:false,transports:['websocket']});
  t.after(async()=>{socket.disconnect();await stop(hub.child);await stop(relay.child);await rm(data,{recursive:true,force:true});});
  await ready(`http://127.0.0.1:${hubPort}/api/health`);
  for(let i=0;i<50;i++){if((await(await fetch(publicBase+'/api/hub')).json()).cafeOnline)break;await new Promise(r=>setTimeout(r,100));}
  socket.connect();await connected(socket);
  const payload={requestId:`q_${crypto.randomUUID()}`,tableId:'t1',items:[{id:'m1',qty:2,price:0.01}],note:'Test only'};
  const accepted=await emit(socket,'order:create',payload);assert.equal(accepted.ok,true);
  assert.equal((await emit(socket,'order:create',payload)).ok,true);
  const orders=JSON.parse(dbCommand(hubData,'console.log(JSON.stringify(store.getActiveOrders()))'));
  assert.equal(orders.length,1);assert.equal(orders[0].total,25);
  assert.equal((await emit(socket,'order:status',{orderId:orders[0].id,status:'paid'})).ok,false);
  assert.equal((await emit(socket,'table:clear',{tableId:'t1'})).ok,false);
  assert.equal((await fetch(publicBase+'/api/settings')).status,403);
  assert.equal((await fetch(publicBase+'/relay/orders')).status,401);
  assert.equal((await fetch(publicBase+'/admin')).status,404);
  assert.equal((await fetch(publicBase+'/api/menu',{method:'DELETE'})).status,403);
  const snapshot=await(await fetch(publicBase+'/api/hub')).json();assert.equal(snapshot.networkMode,'customer-relay');assert.equal(JSON.stringify(snapshot).includes(token),false);
  await stop(hub.child);
  await new Promise((r)=>setTimeout(r,15500));
  assert.equal((await emit(socket,'order:create',{...payload,requestId:`q_${crypto.randomUUID()}`})).ok,false);
});
