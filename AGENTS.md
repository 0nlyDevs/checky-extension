# FANILO extension

- npm only. Code, documentation and commits in English. UI copy: French source in `src/i18n/fr.ts`; `en.ts` and `mg.ts` override it (mark Malagasy you write `// relire (mg)`). Read strings through `src/i18n/index.ts`.
- Manifest V3, TypeScript and Vite. Never request access to all sites or add content scripts for passive monitoring.
- Only send selected content after an explicit confirmation. Use `textContent`, never inject page or model HTML.
- The website owns authentication. Use its existing cookie through a credentialed request to its token endpoint; never read cookies or ask for a password inside the extension.
- Open in public mode, without token requests or a login gate. Anonymous checks use `/public/check`, `/public/image-check` and `/public/image-check/file` (an image file as the raw body) with no credentials. Never silently fall back from private analysis to public processing.
- Public text results show published verdict candidates and external sources, not new AI verdicts. Connection is optional for newsroom analysis and saving; preserve a public result during optional connection.
- Public AI only extracts literal claims/entities and grounded search queries. Stream preparation/search/reading stages; never report blocked services as an empty successful search or copied articles as independent confirmation.
- JWTs and captures belong in `chrome.storage.session`, never local/sync storage. Do not expose external messaging or web-accessible resources.
- AI verdicts are suggestions, dashed and always icon + word. Image provenance and factual truth are separate. Image results are coloured by assessment (red detected, green none, blue inconclusive) with icon and word; green only when a pixel detector actually scored low. Show a percentage only when a detector returned one, labelled as that detector's score, never as a probability; never invent one, and no claims of authenticity from missing markers.
- Follow FANILO's « Le signal clair »: chalk `#f1f2ec`, ink `#171a18`, citron `#d7f45b` for the primary action, Archivo and Atkinson Hyperlegible Next, flat rules, numbered verification flow.
- Run `npm run check`, `npm test` and `npm run build`; test the built extension in Chromium before pushing.
- Commits: one English Conventional Commit subject, no body or attribution trailer.
