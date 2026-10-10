// SPDX-License-Identifier: AGPL-3.0-or-later
// End to end: real server, real signatures, the extension's check logic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../server/src/store.js';
import { createApp } from '../../server/src/app.js';
import { checkPage } from '../check.js';
import * as V from '../vendor/index.js';

test('extension check: verified, copied link, lookalike, unconfirmed, unknown', async () => {
  const server = createApp({ store: new Store(null), host: 'localhost' });
  await new Promise((r) => server.listen(0, r));
  const serverUrl = `http://localhost:${server.address().port}`;
  const post = (p, body) => fetch(serverUrl + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const k = await V.generateKeyPair();
    const { vid, entry } = await V.createVp(k);
    await post('/v1/vp', { entry });
    for (const [platform, handle] of [['instagram', 'realcreator'], ['x', 'realcreator']]) {
      const claim = await V.makeClaim({ priv: k.priv, vid, platform, handle });
      assert.equal((await post(`/v1/vp/${vid}/claims`, { claim })).status, 201);
    }
    const link = V.buildVidLink(new URL(serverUrl).host, vid);
    const base = { serverUrl };

    // real account whose bio carries the VID link
    let r = await checkPage({ ...base, url: 'https://www.instagram.com/realcreator/', pageText: `official account ${link}` });
    assert.equal(r.state, 'verified'); assert.equal(r.vid, vid);

    // link found in an href instead of text
    r = await checkPage({ ...base, url: 'https://x.com/RealCreator', pageLinks: [link] });
    assert.equal(r.state, 'verified');

    // fake account copying the link
    r = await checkPage({ ...base, url: 'https://www.instagram.com/real_creator_official/', pageText: link });
    assert.deepEqual([r.state, r.reason], ['impersonation', 'copied-link']);

    // fake account without the link, lookalike handle
    r = await checkPage({ ...base, url: 'https://www.instagram.com/real.creator/', pageText: 'follow me' });
    assert.deepEqual([r.state, r.reason], ['impersonation', 'lookalike']);

    // real handle but no back-link on the page
    r = await checkPage({ ...base, url: 'https://www.instagram.com/realcreator/', pageText: 'no link here' });
    assert.equal(r.state, 'unconfirmed');

    // VID link on a host we do not trust is ignored
    r = await checkPage({ ...base, url: 'https://www.instagram.com/realcreator/', pageText: `evil.example/v/${vid}` });
    assert.equal(r.state, 'unconfirmed');

    assert.equal((await checkPage({ ...base, url: 'https://github.com/nobody-here' })).state, 'unknown');
    assert.equal((await checkPage({ ...base, url: 'https://example.com/' })).state, 'not-a-profile');
  } finally { server.close(); }
});
