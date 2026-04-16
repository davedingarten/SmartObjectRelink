# AGENTS.md

This repository contains a standalone Adobe Photoshop UXP plugin for scanning and relinking linked Smart Objects across open Photoshop documents.

## Project Intent

- Keep this plugin standalone and separate from `LayerRenamer` and any larger internal tool suite.
- Preserve a small-footprint setup: no React, no bundler, no framework runtime in the panel.
- Optimize for production Photoshop workflows where users need to quickly audit broken or mislocated linked assets and relink them by exact filename.

## Architecture

- `manifest.json`: Photoshop UXP manifest. This currently uses `manifestVersion: 6` to match the local working pattern used in `LayerRenamer`.
- `index.html` + `style.css`: panel shell and styling.
- `panel-loader.js`: small root loader that imports the compiled panel runtime from `build/`.
- `main.cjs`: plugin entrypoint registration.
- `src/ui/panel.ts`: panel state, DOM bindings, render logic, status messages, file picker actions, host-notification refresh behavior.
- `src/core/photoshop.ts`: Photoshop-specific logic for scanning linked Smart Objects, relinking them with batchPlay, and registering host notifications.
- `src/core/project-path.ts`: path normalization, folder extraction, inside-root checks, and display formatting.
- `src/types.ts`: shared types for scan summaries and relink results.
- `build/`: compiled JavaScript output that Photoshop actually runs.

## Reference Source

- Original Alpha Flow Smart Objects panel reference:
  `/Users/davedingarten/Documents/Personal/repositories/alphaflow/Source/Photoshop Plugin UXP-R/src/plugins/SmartObjects/Panel.tsx`
- Visual header/style reference for this standalone plugin:
  `/Users/davedingarten/SideHustles/LayerRenamer/index.html`
  `/Users/davedingarten/SideHustles/LayerRenamer/style.css`

## Working Rules

- Treat `src/` as the source of truth. Do not hand-edit `build/` unless you are debugging an emergency runtime issue.
- After changes to any `.ts` file, run `npm run build` so the compiled runtime in `build/` stays in sync.
- Keep Photoshop DOM and batchPlay logic in `src/core/photoshop.ts`. Do not spread host-specific calls through the UI layer.
- Keep UI logic in `src/ui/panel.ts`. Avoid mixing render code and Photoshop traversal logic.
- Preserve the no-framework approach. If you add dependencies or build tooling, there should be a clear payoff.
- Prefer explicit, predictable actions over clever automation. Users should understand exactly which files will be relinked and why.
- Do not silently broaden filename matching. Current relink behavior is exact filename match only.
- Keep the panel useful in no-document and no-results states. Those are normal workflow states, not exceptional failures.

## Current Behavior

- Scan the current active Photoshop document for linked Smart Object layers.
- Recursively traverse groups and collect only linked Smart Objects, not embedded ones.
- Group results by `fileReference` / filename.
- Show a simple linked-file list with missing-link status.
- Allow relinking by choosing replacement files and matching them by exact filename.
- Auto-refresh on Photoshop `select`, `open`, and `close` notifications after the user has already run one scan.

## Known Gaps And Risks

- This has not been manually validated in Photoshop yet. The TypeScript build passes, but runtime behavior still needs an in-app smoke test.
- `manifestVersion: 6` is being used because it matches the local `LayerRenamer` setup, but Adobe’s public Photoshop docs still prominently document manifest v5. If Photoshop rejects this manifest, verify with the UXP Developer Tool and downgrade only if needed.
- The manifest icon paths currently point to `icons/panelIcon.png` and `icons/pluginIcon.png`, while the copied placeholder icon assets are `panelIcon@1x.png`, `panelIcon@2x.png`, `pluginIcon@1x.png`, and `pluginIcon@2x.png`. This likely needs to be reconciled before loading or packaging.
- Cloud documents and unusual document path shapes have not been explicitly handled beyond safe null-path behavior.
- The current relink flow assumes `placedLayerRelinkToFile` remains the right batchPlay command for linked Smart Object relinking in the target Photoshop version.

## Verification

- Run `npm run build` after TypeScript changes.
- If you change path logic, manually test at least:
- A normal local PSD.
- A PSD with missing links.
- A PSD with linked assets outside the chosen root.
- Multiple open documents with the same linked filename.
- If you change relink behavior, confirm the relinked layer remains linked and points to the intended asset.
- Validate in Photoshop or UXP Developer Tool after UI or manifest changes. Browser assumptions are not enough in UXP.

## Recommended Next Tasks

1. Fix the manifest icon file naming mismatch before the first real load test.
2. Load the plugin in UXP Developer Tool and verify the panel opens.
3. Smoke-test scan behavior on 2-3 real PSDs with linked Smart Objects.
4. Confirm relink behavior on a controlled test document before using it on production assets.
5. Decide whether the automatic project root fallback should stay as “active document folder” or use a more opinionated project-root heuristic.

## Packaging Notes

- Replace placeholder icons in `icons/` before packaging or publishing.
- Do not assume the current plugin `id` is the final distribution ID.
- Before release, package and test the installed build, not just the dev-loaded plugin.
