# Checky — Vérifier ici

The panel is the newsroom's verification margin beside the page, not a second website.
It follows the existing « Le signal clair » identity in `fanilo-base/apps/web/DESIGN.md`.

- Ground `#f3f2ee`, ink `#0a0a0b`, surface `#fbfaf7`, raised `#e9e8e2`, hairline `#dcdbd5`, secondary ink `#55544e`; dark inverts to `#0a0a0b` / `#f3f2ee`. Colour appears only on verdicts (vrai, faux, trompeur, invérifiable). Values live in `src/lib/tokens.ts`, pinned by `tokens.test.ts`.
- Bricolage Grotesque carries everything; Cormorant Garamond italic 500 is reserved for verbatim passages. Both are bundled locally; there are no font network calls.
- A single left-aligned reading column, comfortable at 360–480 px. Flat surfaces, 20 px cards, round controls, 6 px tags, no decorative shadows or gradients.
- The characteristic element is the numbered verification line. Its numbers are actual stages, not decoration.
- The ink primary is the one action and the active stage (its label uses `--action-foreground`). Suggestions use dashed borders and icons with words. Image results may use the four result colours (red, green, blue, amber) as long as the card says in words what was found; an image result is never labelled with a verdict word (Vrai, Faux, Trompeur, Invérifiable).

```
Checky                           Open desk
Verify here.                     Public access / optional newsroom
[ Text | Link | Image ]
[ Selected content, editable              ]
Source and transmission notice
[ Verify this content                     ]
01 Claim — 02 Evidence — 03 Conclusion
Work log / source passages / cautious result
[ Follow in my newsroom                   ]
```

Before implementation, checked against the brief: this is a contextual tool, so there is
no landing-page hero, metric tiles, decorative illustration or marketing copy. The existing
numbered line, meaningful evidence and explicit user confirmation carry the design.

Public checks work immediately without a connection section. Optional connection is offered at
the save action, preserving the result. Related published verdicts use solid borders and include
the full claim, newsroom and date; novel public claims get sources, never a new AI truth label.

The public evidence flow exposes a grounded preparation (claims are quoted, not endorsed), the
actual search queries, service failures and passages genuinely read. Search snippets are labelled
as snippets. An unavailable search gets an ink failure marker rather than a completed-reading
check; zero-source messages never stand in for a blocked service. Possible reprises are neutral
warnings, not another truth colour or a count of independent confirmations.
