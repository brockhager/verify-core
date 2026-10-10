// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { createApp } from '../src/app.js';
import * as V from 'verify-spec';

async function start() {
  const server = createApp({ store: new Store(null), host: 'localhost' });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: r.status === 204 ? null : await r.json() };
  };
  return { server, base, call };
}
async function newVp(call) {
  const k = await V.generateKeyPair();
  const { vid, entry } = await V.createVp(k);
  const r = await call('POST', '/v1/vp', { entry });
  assert.equal(r.status, 201);
  return { k, vid, entry };
}

test('create profile, claims, registry, lookup, did.json', async () => {
  const { server, call } = await start();
  try {
    const a = await newVp(call);
    assert.equal((await call('POST', '/v1/vp', { entry: a.entry })).status, 409);

    const claim = await V.makeClaim({ priv: a.k.priv, vid: a.vid, platform: 'instagram', handle: '@RealCreator' });
    const r1 = await call('POST', `/v1/vp/${a.vid}/claims`, { claim });
    assert.deepEqual([r1.status, r1.json.contested], [201, false]);
    assert.equal((await call('POST', `/v1/vp/${a.vid}/claims`, { claim })).status, 200); // idempotent

    const vp = (await call('GET', `/v/${a.vid}`)).json;
    assert.equal((await V.verifyVp(vp)).claims.length, 1);

    const reg = (await call('GET', '/v1/registry')).json.entries;
    assert.deepEqual(reg.map((e) => [e.p, e.h, e.v]), [['instagram', 'realcreator', a.vid]]);

    const lk = await call('GET', '/v1/lookup?platform=instagram&handle=REALCREATOR');
    assert.equal(lk.json.claims.length, 1);
    assert.equal((await call('GET', '/v1/lookup?platform=nope&handle=x')).status, 400);

    const did = (await call('GET', `/v/${a.vid}/did.json`)).json;
    assert.equal(did.id, `did:web:localhost:v:${a.vid}`);
    assert.deepEqual(did.alsoKnownAs, ['https://www.instagram.com/realcreator']);
    assert.equal((await call('GET', '/v/' + 'Z'.repeat(22))).status, 404);
  } finally { server.close(); }
});

test('rejects bad claims', async () => {
  const { server, call } = await start();
  try {
    const a = await newVp(call);
    const stranger = await V.generateKeyPair();
    const forged = await V.makeClaim({ priv: stranger.priv, vid: a.vid, platform: 'x', handle: 'abc' });
    assert.equal((await call('POST', `/v1/vp/${a.vid}/claims`, { claim: forged })).status, 400);

    const old = await V.makeClaim({ priv: a.k.priv, vid: a.vid, platform: 'x', handle: 'abc', now: new Date(Date.now() - 3600e3) });
    const r = await call('POST', `/v1/vp/${a.vid}/claims`, { claim: old });
    assert.equal(r.status, 400); assert.match(r.json.error, /timestamp/);

    const reserved = await V.makeClaim({ priv: a.k.priv, vid: a.vid, platform: 'x', handle: 'home' });
    assert.equal((await call('POST', `/v1/vp/${a.vid}/claims`, { claim: reserved })).status, 400);

    const other = await newVp(call);
    const wrongVid = await V.makeClaim({ priv: other.k.priv, vid: other.vid, platform: 'x', handle: 'abc' });
    assert.equal((await call('POST', `/v1/vp/${a.vid}/claims`, { claim: wrongVid })).status, 400);
  } finally { server.close(); }
});

test('two profiles claiming one handle are reported as contested', async () => {
  const { server, call } = await start();
  try {
    const a = await newVp(call), b = await newVp(call);
    const ca = await V.makeClaim({ priv: a.k.priv, vid: a.vid, platform: 'github', handle: 'octo' });
    const cb = await V.makeClaim({ priv: b.k.priv, vid: b.vid, platform: 'github', handle: 'octo' });
    assert.equal((await call('POST', `/v1/vp/${a.vid}/claims`, { claim: ca })).json.contested, false);
    assert.equal((await call('POST', `/v1/vp/${b.vid}/claims`, { claim: cb })).json.contested, true);
  } finally { server.close(); }
});

test('key rotation: valid accepted, forged rejected', async () => {
  const { server, call } = await start();
  try {
    const a = await newVp(call);
    const k2 = await V.generateKeyPair();
    const rot = await V.makeRotation({ priv: a.k.priv, vid: a.vid, prevEntry: a.entry, newPub: k2.pub });
    const ok = await call('POST', `/v1/vp/${a.vid}/log`, { entry: rot });
    assert.equal(ok.status, 200);
    assert.ok(new Date(ok.json.effectiveAt) - Date.now() > 47 * 3600e3);

    const b = await newVp(call);
    const k3 = await V.generateKeyPair();
    const evil = await V.makeRotation({ priv: k3.priv, vid: b.vid, prevEntry: b.entry, newPub: k3.pub });
    assert.equal((await call('POST', `/v1/vp/${b.vid}/log`, { entry: evil })).status, 400);
  } finally { server.close(); }
});

test('bad input', async () => {
  const { server, base, call } = await start();
  try {
    assert.equal((await call('POST', '/v1/vp', { entry: { body: { type: 'rotate' } } })).status, 400);
    const r = await fetch(base + '/v1/vp', { method: 'POST', body: '{not json' });
    assert.equal(r.status, 400);
    assert.equal((await call('GET', '/nope')).status, 404);
  } finally { server.close(); }
});
