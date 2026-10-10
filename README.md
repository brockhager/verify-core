# verify-core

Registry server and browser extension (license: AGPL-3.0-or-later, planned; add the official license text before publishing).

    npm install        # links ../verify-spec
    npm test           # syncs the spec into the extension, then runs all tests
    npm start          # server on http://localhost:8787, data in ./data

Your own profile (pilot; the private key is saved unencrypted in .verify/):

    node scripts/vp.mjs init
    node scripts/vp.mjs claim github <handle>
    node scripts/vp.mjs show        # prints the link to put in each bio

Extension: run `npm run sync-spec`, then load `extension/` as an unpacked extension in Chrome (developer mode). It has no site permissions; it reads a page only when you open its popup.
