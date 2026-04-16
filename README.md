# Smart Objects Relink

Standalone Adobe Photoshop UXP panel for scanning linked Smart Objects across all open documents and relinking them by filename.

## Structure

- `manifest.json`: Photoshop UXP manifest
- `index.html` + `style.css`: panel UI
- `panel-loader.js`: loads the compiled CommonJS panel runtime
- `src/`: TypeScript source
- `build/`: compiled JavaScript output used by Photoshop at runtime

## Commands

- `npm run build`: compile TypeScript into `build/`
- `npm run watch`: rebuild on change
- `npm run typecheck`: validate TypeScript without emitting files

## Notes

- This scaffold mirrors the simple no-framework setup used in `LayerRenamer`.
- The manifest uses v6 to match the working local plugin structure in `LayerRenamer`.
- Placeholder icons are expected in `icons/` and should be replaced before distribution.
