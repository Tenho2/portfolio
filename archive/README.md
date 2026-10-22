# Archived layouts

These files are **not part of the built application**. They are kept as frozen
references so a retired layout can be restored deliberately rather than
reconstructed from memory.

## What is here

| Path | What it was |
| ---- | ----------- |
| `wide/ev-tracker-wide.html` | Generated snapshot of the "Wide (top bar)" layout |
| `wide/app/layout-wide.css` | Its layout-only stylesheet |
| `glass/ev-tracker-glass.html` | Generated snapshot of the Glass (aurora) UI |
| `glass/app/ui/glass.css` | Its theme stylesheet |
| `tests/test-layout-wide.mjs` | The suite that pinned the wide arrangement |

The snapshots keep their original relative links, so they are not runnable from
this folder. They are for reading and diffing, not for serving.

## How to restore one

1. Move its stylesheet back:
   - `wide/app/layout-wide.css` → `app/layout-wide.css`
   - `glass/app/ui/glass.css` → `app/ui/glass.css`
2. Add the layout back to `LAYOUTS` in `app/shell.mjs` **and** to the matching
   list in `app/app.js` (`LAYOUT_PAGES`); add `"glass"` to `UI_THEMES` if it is
   an experimental UI.
3. For wide, move `tests/test-layout-wide.mjs` back to `tools/` and re-add it to
   `test:markup` in `package.json`.
4. Add the page and stylesheet to `SHELL`/`PAGES` in `sw.js` and bump `VERSION`.
5. Restore the i18n label (`set.layoutWide` / `set.layoutGlass`) in en, fi and sv.
6. Run `node tools/emit-pages.mjs`; never copy the archived HTML back as the
   live page, because it will not pick up later markup changes.
7. Run `npm run check`.

The retired-layout map in `app/app.js` (`wide → classic`, `glass → hud`) will
keep redirecting old stored preferences to the replacement until it is updated.
