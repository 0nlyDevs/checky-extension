# FANILO — Vérifier ici

Check selected text, a link or an image without leaving the page. FANILO opens beside it,
shows the evidence and suggests a conclusion. A journalist still decides what to publish.

The extension connects to the same newsroom API as the [web desk](https://github.com/0nlyDevs/fanilo-base)
and the [phone app](https://github.com/0nlyDevs/fanilo-mobile). All interface copy is French.

## What works

- Select text → right-click **Vérifier ce texte avec FANILO** → review the captured passage → verify.
- Right-click a public link or image, or paste its URL in the panel.
- Sign in on the FANILO website, then refresh the extension's connection and choose a newsroom.
- Watch the numbered line: **01 L’affirmation → 02 Les éléments → 03 La conclusion**.
- Read dated sources, checked quotations and warning signs. AI conclusions are dashed suggestions.
- Examine image metadata and generator markers, with explicit uncertainty and reverse-search links.
- Save a dossier only after confirmation, with the original links and selected evidence. Failed
  source attachments can be retried without creating another dossier. The extension never confirms
  or publishes a verdict.

**Image analysis is not a reliable yes/no detector.** No markers does not mean authentic.
Content Credentials structures are detected, not cryptographically verified. A pixel detector is
optional, disabled by default and not contacted until an operator has configured and evaluated it.
An AI-generated image is not necessarily misinformation; a real image can have a false caption.

## Install locally

Prerequisites: Node 22.18+ (CI uses Node 26), npm, and Chrome 116+ or a compatible Chromium browser.

```bash
npm ci
npm run build
```

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Enable **Developer mode** and choose **Load unpacked**.
3. Select this repository's **`dist/`** directory, not the repository root.
4. Pin FANILO. Click its icon or use the right-click menu on a web page.
5. Sign in at https://fanilo-mg.vercel.app in the same browser profile; click
   **Actualiser la connexion** in the extension and choose your newsroom.

The build is configured for the production web and API URLs. The API needs the `image-check`
endpoint from `fanilo-base`; text verification uses the existing `link-check` endpoint.
This repository does not publish to a browser store. Edge and Brave need manual validation;
if the browser cannot open a side panel, the extension tries its own tab instead.

If authentication does not work, check host permissions and third-party cookie settings. The
extension deliberately does not bypass browser privacy settings, extract cookies or ask for your
password. Disconnecting it clears its token; signing out on the website is a separate action.

## Run against a local FANILO

Run the web on `http://localhost:3000` and the API on `http://localhost:8000`, following the web
repository's README. Then:

```bash
npm run build:local
```

Load **`dist-local/`**. It has permissions only for those two local services. After each rebuild,
reload the extension on the browser's extensions page and reopen its panel.

Custom deployments use build-time public URLs in `.env` (see `.env.example`). Only HTTPS is
accepted, except HTTP on localhost for development. These settings are not provider credentials.
The manifest's host permissions are generated from exactly those two origins.

## Permissions and data

| Permission | Why |
| --- | --- |
| `contextMenus` | Receive only the selection, image URL or link chosen with a right-click |
| `sidePanel` | Show the verification beside the page |
| `storage` | Keep short-lived authentication and capture handoff in `storage.session` |
| FANILO web/API origins | Fetch the existing session JWT and call the newsroom API |

There are **no content scripts**, no access to all sites, no cookie-reading permission, no
clipboard monitoring, no browsing history and no external messaging. Website selection is
untrusted data, never HTML to execute. Links are restricted to HTTP(S) without credentials.

Captures are scoped to their window, expire after 15 minutes if not consumed, and are removed
from session storage when loaded. Results stay in the panel's memory. JWTs expire after 15 minutes
and live only in session storage. No selected content, history or credentials are put in
`storage.local` or `storage.sync`.

The panel previews the content and waits for **Vérifier ce contenu** or **Examiner l’image** before
sending it. A selected passage is sent as text only; FANILO does not silently analyze the rest of
its page. The page's URL is retained as provenance and is attached only when saving a dossier.
The backend and AI providers process submitted text. The image endpoint downloads public images;
it forwards their bytes to a pixel detector only when the operator explicitly enables a validated
service. Do not submit confidential material. Reverse-image services receive the image URL only
after you click their link.

Limitations: protected pages/images, `blob:`/`data:` images, screenshots, OCR, Firefox and Safari
are not supported by this version. The panel can verify a manually entered image caption, but
does not claim to understand an image's scene from pixels.

## Development

```bash
npm run check
npm test
npm run build
npm run gen:api       # requires ../fanilo-base/packages/shared/openapi.json
```

`src/lib/api-schema.d.ts` is generated; do not edit it by hand. API credentials stay in the server.
There are no runtime JavaScript framework dependencies. Fonts are packaged locally, not fetched
from Google. Fonts use SIL Open Font License 1.1; their notices and full licenses are included
in every build's `licenses/` directory.
Build tools and their versions are pinned in `package-lock.json`.

### Browser checks

```bash
npm run build:local
uv run --with playwright python tests/e2e.py
```

The browser test loads the actual built extension in a fresh Chromium profile. Its local HTTP
fixtures exercise credentialed cookie-based login, explicit content confirmation, streamed
results, safe rendering, dossier creation and retry, cautious image hints and interrupted
streams. Fixtures do not call AI services or spend credits. Screenshots go to `test-results/`.

Before distribution, also test a real context-menu click, side-panel opening, production login,
expired sessions, real public image URLs, and Edge/Brave's cookie and panel behaviour. No browser
store approval or real pixel-detector evaluation is claimed by these automated checks.

The icon can be regenerated with `uv run --with pillow python scripts/build_icons.py`.
Design decisions are in `DESIGN.md`; implementation/security conventions are in `AGENTS.md`.
