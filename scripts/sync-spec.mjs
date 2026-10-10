// SPDX-License-Identifier: AGPL-3.0-or-later
// Copies the spec library into the extension (extensions cannot import from node_modules).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.realpathSync(path.join(root, 'node_modules', 'verify-spec', 'src'));
const dst = path.join(root, 'extension', 'vendor');
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src)) if (f.endsWith('.js')) fs.copyFileSync(path.join(src, f), path.join(dst, f));
console.log(`synced verify-spec into ${path.relative(root, dst)}`);
