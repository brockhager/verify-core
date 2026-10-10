// SPDX-License-Identifier: AGPL-3.0-or-later
import { checkPage } from './check.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_SERVER = 'http://localhost:8787';

const VIEW = {
  verified: (r) => ['Verified', 'ok', `Linked to a Verify profile since ${r.since.slice(0, 10)}.` + (r.recentlyChanged ? ' Recently added: be careful.' : '')],
  impersonation: (r) => ['Possible impersonation', 'bad', r.reason === 'copied-link'
    ? 'This page shows a Verify link, but that profile does not list this account.'
    : `Looks like the registered account "${r.handle}" (${r.reason}).`],
  unconfirmed: () => ['Registered, not confirmed', 'warn', 'A Verify profile lists this account, but the page does not link back to it.'],
  unverifiable: () => ['Could not verify', 'warn', 'The page links to a Verify profile that could not be checked.'],
  unknown: () => ['Not registered', '', 'No information. This does not mean the account is fake.'],
  'not-a-profile': () => ['Not a profile page', '', 'Open a profile on X, LinkedIn, GitHub, Facebook or Instagram.'],
  error: (r) => ['Error', 'warn', r.error],
};

function show(r) {
  const [title, cls, detail] = (VIEW[r.state] ?? VIEW.error)(r);
  $('result').textContent = title;
  $('result').className = cls;
  $('detail').textContent = detail;
}

async function run() {
  const stored = await chrome.storage.local.get('serverUrl');
  const serverUrl = stored.serverUrl ?? DEFAULT_SERVER;
  $('server').value = serverUrl;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Reads only the page you are on, only when you open this popup (activeTab).
    const [{ result: page }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        links: [...document.querySelectorAll('a[href]')].map((a) => a.href).slice(0, 500),
        text: (document.body?.innerText ?? '').slice(0, 20000),
      }),
    });
    show(await checkPage({ url: tab.url, pageLinks: page.links, pageText: page.text, serverUrl }));
  } catch (e) {
    show({ state: 'error', error: String(e.message ?? e) });
  }
}

$('server').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ serverUrl: e.target.value.replace(/\/$/, '') });
  run();
});
run();
