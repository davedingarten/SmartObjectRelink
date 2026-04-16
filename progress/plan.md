# Smart Objects Relink Plan

Last updated: 2026-04-16

## Current State

The repository has a working first-pass scaffold for a standalone Photoshop UXP panel in `/Users/davedingarten/SideHustles/SmartObjectsRelink`.

Implemented:

- Root UXP plugin structure: `manifest.json`, `index.html`, `style.css`, `main.cjs`, `panel-loader.js`.
- TypeScript source layout under `src/`.
- Compiled JavaScript runtime under `build/`.
- Scan flow for linked Smart Objects across all open documents.
- Recursive layer traversal for groups.
- Result grouping by `fileReference` / filename.
- Status handling for missing links and linked assets outside the project root.
- Manual project-root picker plus auto fallback.
- Relink flow that matches selected files by exact filename and uses batchPlay relink.
- Host notification refresh wiring for `select`, `open`, and `close`.

Completed validation:

- `npm install`
- `npm run build`
- Basic JSON parsing check for `manifest.json` and `package.json`

Not yet validated:

- Actual loading in Photoshop / UXP Developer Tool
- Manifest acceptance in the real host
- Runtime UI behavior in Photoshop
- End-to-end relink behavior on real PSDs

## Important Files

- Core Photoshop logic: [src/core/photoshop.ts](/Users/davedingarten/SideHustles/SmartObjectsRelink/src/core/photoshop.ts:1)
- Path utilities: [src/core/project-path.ts](/Users/davedingarten/SideHustles/SmartObjectsRelink/src/core/project-path.ts:1)
- Panel UI/state: [src/ui/panel.ts](/Users/davedingarten/SideHustles/SmartObjectsRelink/src/ui/panel.ts:1)
- UXP manifest: [manifest.json](/Users/davedingarten/SideHustles/SmartObjectsRelink/manifest.json:1)
- Runtime loader: [panel-loader.js](/Users/davedingarten/SideHustles/SmartObjectsRelink/panel-loader.js:1)

## Known Issues

1. Icon path mismatch in manifest.
   `manifest.json` currently references `icons/pluginIcon.png` and `icons/panelIcon.png`, but the copied placeholder files are `pluginIcon@1x.png`, `pluginIcon@2x.png`, `panelIcon@1x.png`, and `panelIcon@2x.png`.

2. Manifest version assumption still needs host validation.
   The project intentionally uses `manifestVersion: 6` because `LayerRenamer` does, but Photoshop acceptance has not been confirmed yet in this plugin.

3. No manual Photoshop validation yet.
   The code compiles, but the batchPlay scan and relink flow still need real PSD tests.

4. Project-root heuristic is intentionally minimal.
   Auto mode uses the active document folder. If the intended workflow expects a broader inferred project root, that logic needs to be defined and implemented deliberately.

5. Cloud document behavior is unverified.
   `document.path` may behave differently for cloud docs, so null or non-filesystem paths need explicit QA.

## Recommended Next Session

1. Fix the icon file mismatch.
   Easiest option: rename or copy the placeholder icons so `manifest.json` points to files that actually exist.

2. Load the plugin in UXP Developer Tool.
   Confirm the manifest, entrypoint, icons, and panel wiring are accepted by Photoshop.

3. Run a scan smoke test with real PSDs.
   Test cases:
   - One PSD with valid linked Smart Objects.
   - One PSD with at least one missing linked asset.
   - Multiple open PSDs sharing the same linked filename.

4. Run a relink smoke test.
   Use a disposable document first. Confirm that relinking by selected filename updates the Smart Object link rather than embedding or placing a new independent layer unexpectedly.

5. Decide whether to improve the UI before adding more logic.
   If the workflow is basically correct, the next best improvements are:
   - richer per-item details
   - better warning copy
   - confirmation around relink scope
   - filtering/search if the list gets large

## If Things Break

- If the panel does not load:
  - check `manifest.json`
  - check icon paths
  - confirm `build/ui/panel.js` exists
  - confirm `panel-loader.js` still requires the compiled runtime

- If TypeScript changes do not show up in Photoshop:
  - run `npm run build`
  - verify timestamps in `build/`
  - reload the plugin in UXP Developer Tool

- If relinking fails:
  - inspect the layer descriptor from `getLayerDescriptor()`
  - confirm `fileReference` matches the chosen file name exactly
  - confirm `placedLayerRelinkToFile` still behaves as expected in the target Photoshop version

## Design Intention

This plugin should stay narrow and reliable:

- one panel
- one job
- minimal setup
- predictable filename-based relinking

Do not turn this into a general PSD management suite unless that becomes an explicit product decision.
