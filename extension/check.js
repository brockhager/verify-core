// SPDX-License-Identifier: AGPL-3.0-or-later
import { parseProfileUrl, extractVidLinks, verifyVp, evaluateAccount } from './vendor/index.js';

// Runs one check for the page the user is looking at. Read-only, on demand.
//  url, pageLinks (hrefs), pageText: taken from the active tab when the user clicks the extension
//  serverUrl: the registry; trustedHosts: hosts whose VID links we accept
export async function checkPage({ url, pageLinks = [], pageText = '', serverUrl, fetchFn = fetch, now = new Date() }) {
  const prof = parseProfileUrl(url);
  if (!prof) return { state: 'not-a-profile' };

  const hosts = [new URL(serverUrl).host];
  const found = new Set();
  for (const s of [...pageLinks, pageText]) for (const l of extractVidLinks(s, { hosts })) found.add(l.vid);
  const pageVids = [...found].slice(0, 5);

  // Whole public list is downloaded, so the server never sees which profile you are viewing (D15).
  const regRes = await fetchFn(`${serverUrl}/v1/registry`);
  if (!regRes.ok) return { state: 'error', error: `registry returned ${regRes.status}` };
  const { entries: registry } = await regRes.json();

  // Only a VID link found on the page is fetched; that leaks that this VP was seen, nothing else.
  const vps = {};
  for (const vid of pageVids) {
    try {
      const r = await fetchFn(`${serverUrl}/v/${vid}`);
      vps[vid] = r.ok ? await verifyVp(await r.json()) : { ok: false };
    } catch {
      vps[vid] = { ok: false };
    }
  }
  return { ...prof, ...evaluateAccount({ ...prof, pageVids, vps, registry, now }) };
}
