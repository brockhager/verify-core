// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';

// v1 store: in memory, saved to one JSON file. Replace with a real database later.
export class Store {
  constructor(file) {
    this.file = file;
    this.vps = new Map();
    if (file && fs.existsSync(file)) {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [k, v] of Object.entries(d.vps)) this.vps.set(k, v);
    }
  }
  save() {
    if (!this.file) return;
    fs.writeFileSync(this.file + '.tmp', JSON.stringify({ vps: Object.fromEntries(this.vps) }));
    fs.renameSync(this.file + '.tmp', this.file);
  }
  has(vid) { return this.vps.has(vid); }
  get(vid) { return this.vps.get(vid); }
  put(vid, vp) { this.vps.set(vid, vp); this.save(); }
  // Every VP that lists this platform+handle (claims are checked by the caller).
  claimsFor(platform, handle) {
    const out = [];
    for (const vp of this.vps.values()) {
      for (const c of vp.claims) {
        if (c.body.platform === platform && c.body.handle === handle) out.push({ vid: vp.vid, created: c.body.created });
      }
    }
    return out;
  }
}
