// SPDX-License-Identifier: AGPL-3.0-or-later
import http from 'node:http';
import {
  verifyLog, verifyClaim, vidFromBody, didDocument, normalizeHandle, isValidHandle,
  PLATFORMS, makeRegistryEntry,
} from 'verify-spec';

const MAX_BODY = 64 * 1024;
const CLAIM_WINDOW_MS = 10 * 60 * 1000; // claim timestamps must be close to server time (see Q24)

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new HttpError(400, 'invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*', // all GET data is public
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
  });
  res.end(data);
}

export function createApp({ store, host, now = () => new Date() }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const path = url.pathname;
      if (req.method === 'OPTIONS') return send(res, 204, {});

      if (req.method === 'GET' && path === '/healthz') return send(res, 200, { ok: true });

      let m;
      if (req.method === 'GET' && (m = path.match(/^\/v\/([A-Za-z0-9_-]{22})$/))) {
        const vp = store.get(m[1]);
        if (!vp) throw new HttpError(404, 'unknown VID');
        return send(res, 200, vp);
      }
      if (req.method === 'GET' && (m = path.match(/^\/v\/([A-Za-z0-9_-]{22})\/did\.json$/))) {
        const vp = store.get(m[1]);
        if (!vp) throw new HttpError(404, 'unknown VID');
        return send(res, 200, didDocument({ host, vid: vp.vid, log: vp.log, claims: vp.claims, now: now() }));
      }

      // The public list the extension downloads and checks locally (D15).
      if (req.method === 'GET' && path === '/v1/registry') {
        const entries = [];
        for (const vp of store.vps.values()) {
          for (const c of vp.claims) entries.push(makeRegistryEntry(c.body.platform, c.body.handle, vp.vid, c.body.created));
        }
        return send(res, 200, { generated: now().toISOString(), entries });
      }

      if (req.method === 'GET' && path === '/v1/lookup') {
        const platform = url.searchParams.get('platform') ?? '';
        const handle = url.searchParams.get('handle') ?? '';
        if (!PLATFORMS[platform] || !isValidHandle(platform, handle)) throw new HttpError(400, 'bad platform or handle');
        return send(res, 200, { claims: store.claimsFor(platform, normalizeHandle(platform, handle)) });
      }

      // Writes are all signed by the VP's DID key, so no accounts or passwords exist.
      if (req.method === 'POST' && path === '/v1/vp') {
        const { entry } = await readJson(req);
        if (entry?.body?.type !== 'create') throw new HttpError(400, 'expected a create entry');
        const vid = await vidFromBody(entry.body);
        if (store.has(vid)) throw new HttpError(409, 'VID already exists');
        const r = await verifyLog([entry], vid);
        if (!r.ok) throw new HttpError(400, r.error);
        store.put(vid, { vid, log: [entry], claims: [] });
        return send(res, 201, { vid });
      }

      if (req.method === 'POST' && (m = path.match(/^\/v1\/vp\/([A-Za-z0-9_-]{22})\/log$/))) {
        const vp = store.get(m[1]);
        if (!vp) throw new HttpError(404, 'unknown VID');
        const { entry } = await readJson(req);
        const candidate = [...vp.log, entry];
        const r = await verifyLog(candidate, vp.vid);
        if (!r.ok) throw new HttpError(400, r.error);
        store.put(vp.vid, { ...vp, log: candidate });
        return send(res, 200, { ok: true, effectiveAt: entry.body.effectiveAt });
      }

      if (req.method === 'POST' && (m = path.match(/^\/v1\/vp\/([A-Za-z0-9_-]{22})\/claims$/))) {
        const vp = store.get(m[1]);
        if (!vp) throw new HttpError(404, 'unknown VID');
        const { claim } = await readJson(req);
        const b = claim?.body;
        if (!b || b.vid !== vp.vid) throw new HttpError(400, 'claim is for a different VID');
        if (!PLATFORMS[b.platform] || !isValidHandle(b.platform, b.handle)) throw new HttpError(400, 'bad platform or handle');
        if (Math.abs(new Date(b.created) - now()) > CLAIM_WINDOW_MS) throw new HttpError(400, 'claim timestamp outside allowed window');
        if (!(await verifyClaim(vp.log, claim))) throw new HttpError(400, 'bad claim signature');
        const exists = vp.claims.some((c) => c.body.platform === b.platform && c.body.handle === b.handle);
        if (!exists) store.put(vp.vid, { ...vp, claims: [...vp.claims, claim] });
        // Another VP may list the same handle. Which one is real is decided by the link on the
        // account itself (D22), so we only report the contest. Dispute policy: open question Q13.
        const contested = store.claimsFor(b.platform, b.handle).some((c) => c.vid !== vp.vid);
        return send(res, exists ? 200 : 201, { ok: true, contested });
      }

      throw new HttpError(404, 'not found');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: 'internal error' });
    }
  });
}
