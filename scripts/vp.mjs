// SPDX-License-Identifier: AGPL-3.0-or-later
// Pilot command line for your own Verify profile.
//   node scripts/vp.mjs init [server]        create a profile (default http://localhost:8787)
//   node scripts/vp.mjs claim <platform> <handle>
//   node scripts/vp.mjs show
// WARNING: the private key is saved unencrypted in .verify/profile.json (pilot only). Back it up
// and never share it. A recovery phrase comes later (D12).
import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPair, createVp, makeClaim, buildVidLink } from 'verify-spec';

const file = path.resolve('.verify', 'profile.json');
const [cmd, a, b] = process.argv.slice(2);
const load = () => JSON.parse(fs.readFileSync(file, 'utf8'));
const post = async (server, p, body) => {
  const r = await fetch(server + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status}: ${j.error}`);
  return j;
};

if (cmd === 'init') {
  if (fs.existsSync(file)) throw new Error('profile already exists in .verify/');
  const server = a ?? 'http://localhost:8787';
  const k = await generateKeyPair();
  const { vid, entry } = await createVp(k);
  await post(server, '/v1/vp', { entry });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ server, vid, ...k, log: [entry] }, null, 2), { mode: 0o600 });
  console.log(`Created profile ${vid}\nPut this link in the bio of each account:\n  ${buildVidLink(new URL(server).host, vid)}`);
} else if (cmd === 'claim') {
  const p = load();
  const claim = await makeClaim({ priv: p.priv, vid: p.vid, platform: a, handle: b });
  const r = await post(p.server, `/v1/vp/${p.vid}/claims`, { claim });
  console.log(`Claimed ${a}:${claim.body.handle}` + (r.contested ? ' (another profile also lists this handle)' : ''));
} else if (cmd === 'show') {
  const p = load();
  console.log(`VID: ${p.vid}\nLink: ${buildVidLink(new URL(p.server).host, p.vid)}`);
} else {
  console.log('usage: init [server] | claim <platform> <handle> | show');
}
