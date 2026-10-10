// SPDX-License-Identifier: AGPL-3.0-or-later
import path from 'node:path';
import fs from 'node:fs';
import { Store } from './store.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.VERIFY_HOST ?? `localhost:${port}`;
const dataDir = process.env.VERIFY_DATA ?? path.resolve('data');
fs.mkdirSync(dataDir, { recursive: true });
const store = new Store(path.join(dataDir, 'registry.json'));
createApp({ store, host }).listen(port, () => console.log(`verify-core listening on ${host}`));
