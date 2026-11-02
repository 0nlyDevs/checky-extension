# FANILO extension

- npm only. Code, documentation and commits in English; all UI copy in `src/i18n/fr.ts`.
- Manifest V3, TypeScript and Vite. Never request access to all sites or add content scripts for passive monitoring.
- Only send selected content after an explicit confirmation. Use `textContent`, never inject page or model HTML.
- The website owns authentication. Use its existing cookie through a credentialed request to its token endpoint; never read cookies or ask for a password inside the extension.
- Open in public mode, without token requests or a login gate. Anonymous checks use `/public/check` and `/public/image-check` with no credentials. Never silently fall back from private analysis to public processing.
- Public text results show published verdict candidates and external sources, not new AI verdicts. Connection is optional for newsroom analysis and saving; preserve a public result during optional connection.
- JWTs and captures belong in `chrome.storage.session`, never local/sync storage. Do not expose external messaging or web-accessible resources.
- AI verdicts are suggestions, dashed and always icon + word. Image provenance and factual truth are separate. No fabricated confidence percentages or claims of authenticity from missing markers.
- Follow FANILO's « Le signal clair »: chalk `#f1f2ec`, ink `#171a18`, citron `#d7f45b` for the primary action, Archivo and Atkinson Hyperlegible Next, flat rules, numbered verification flow.
- Run `npm run check`, `npm test` and `npm run build`; test the built extension in Chromium before pushing.
- Commits: one English Conventional Commit subject, no body or attribution trailer.
