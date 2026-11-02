# FANILO — Vérifier ici

Check selected text, a link or an image without leaving the page. FANILO opens beside it,
shows sources and related published verifications. **No account is needed.** A journalist still
decides what to publish; a signed-in newsroom mode also offers AI-assisted analysis.

The extension connects to the same newsroom API as the [web desk](https://github.com/0nlyDevs/fanilo-base)
and the [phone app](https://github.com/0nlyDevs/fanilo-mobile). All interface copy is French.

## What works

- Select text → right-click **Vérifier ce texte avec FANILO** → review the captured passage → verify.
- Right-click a public link or image, or paste its URL in the panel.
- Use public text/link checks and image examination immediately, without signing in or fetching a token.
- Read related published verdicts with their claim, newsroom and date. A related claim is not an
  automatic verdict on your passage. For a new topic, examine the external sources; no verdict is invented.
- Watch the numbered line: **01 L’affirmation → 02 Les éléments → 03 La conclusion**.
- Optional newsroom mode: sign in on FANILO, choose a newsroom and get checked quotations,
  warning signs and AI conclusions displayed as dashed suggestions.
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
5. Verify text, a link or an image directly. No login is needed.

To save a dossier, click **Enregistrer dans une rédaction**. Only then is connection offered.
Sign in at https://fanilo-mg.vercel.app in the same browser profile, click **Actualiser la connexion**
and choose your newsroom. The public result stays visible; nothing is saved until you confirm.
**Ma rédaction** opens the optional authenticated analysis mode. **Continuer sans compte** returns
to public checks. Public mode does not probe your website session even if you are already signed in.

The build is configured for the production web and API URLs. The API needs `/public/check` and
`/public/image-check` from `fanilo-base`. Private newsroom mode uses the authenticated `link-check`
and `image-check` endpoints. If the server is not updated, public checks show an availability error;
they never silently send the content through another audience's endpoint.
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
| FANILO web/API origins | Call public checks; obtain a session JWT only after an explicit optional connection |

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
Public text checks send a bounded search query to search services and compare it with published
verdicts; they do not call an LLM or read private dossiers. Private newsroom checks may use AI
providers. The image endpoint downloads public images; it forwards bytes to a pixel detector only
when the operator explicitly enables a validated service. Anonymous detector access has an
additional, separate opt-in. Do not submit confidential material. Reverse-image services receive
the image URL only after you click their link.

The public text/image endpoints share per-process limits: 12 requests per address per 10 minutes,
1,000 requests per 24-hour budget period, and two concurrent checks. Inputs are bounded; images
are limited to 5 MB and 20 MP. An image with a caption uses two requests. These in-memory budgets
are not distributed; multi-worker deployments need a shared edge limiter. Limits are configurable
server-side with `PUBLIC_CHECKS_PER_WINDOW`, `PUBLIC_CHECKS_PER_DAY` and `PUBLIC_CHECKS_CONCURRENCY`.

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
fixtures first verify text and images anonymously, asserting that no token request is made.
They also exercise optional cookie-based login while preserving the public result, explicit
content confirmation, private streamed results, safe rendering, dossier creation and retry,
cautious image hints and interrupted streams. They ensure private failures never silently
fall back to public processing. Fixtures do not call AI services or spend credits. Screenshots
go to `test-results/`.

Before distribution, also test a real context-menu click, side-panel opening, production login,
expired sessions, real public image URLs, and Edge/Brave's cookie and panel behaviour. No browser
store approval or real pixel-detector evaluation is claimed by these automated checks.

The icon can be regenerated with `uv run --with pillow python scripts/build_icons.py`.
Design decisions are in `DESIGN.md`; implementation/security conventions are in `AGENTS.md`.
