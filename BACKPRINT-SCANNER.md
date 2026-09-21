# Backprint scanner V1

The scanner identifies sets using conventional grayscale image similarity. It uses no AI, image recognition service, API key, or photo upload endpoint. Selected photos stay in browser memory and are released when replaced or the scanner closes.

## Integration and files

Changed: `components/global-set-search.tsx`, `package.json`, `package-lock.json`.

Added: `components/backprint-scanner.tsx`, `components/backprint-scanner.css`, `lib/backprint-matcher.ts`, `lib/backprint-worker.ts`, `lib/backprint-worker-client.d.ts`, `scripts/build-backprint-index.mjs`, `scripts/backprint-scanner.test.mjs`, `public/backprint-index.json`, and this document.

The existing Base UI dialog supplies focus trapping, Escape dismissal and focus restoration. The existing header search is wrapped with the scanner trigger in a single flex row. Results use the existing `/?set=<encoded set ID>` route, without auto-navigation. Current runtime catalog visibility filters the index before matching; titles are read from the current catalog.

## Reference index and adding backprints

Run `npm run scanner:index` from the app directory. This also runs before `npm run dev` and `npm run build`. Directly invoking Vite/Vinext bypasses npm lifecycle hooks, so run the index command first in that case.

The generator reads `lib/catalog.json` plus the existing `supabase/import/public-catalog.json` export, whose records override the base catalog by set ID. It includes published set covers (the existing catalog uses backprints as covers), and automatically discovers `backprint*.webp/png/jpg/jpeg/avif` siblings in each set's `/images/teks/` directory. A cover without a backprint filename is still included. No individual set is hardcoded.

For additional images outside set-specific folders, add an optional `backprints` array to the existing catalog set record, for example:

```json
"backprints": [
  {"image_path": "/images/catalog-import/example.webp", "print_variant": "Second print"}
]
```

Use the existing local CMS public-catalog export workflow for new CMS records/uploads, then regenerate the index and rebuild. Live CMS changes are not automatically reflected until exported and rebuilt. Never point the generator at private uploads. Missing or external assets fail generation with an actionable error; exported assets must exist under `public/images/`.

Entries retain full image paths, set IDs, titles, variants and fingerprints. Identical filenames in different folders do not collide. The current index has 92 entries for 79 sets and is approximately 147 KiB uncompressed. Only this compact file is fetched once per page session, on the first scan; full reference images load only for displayed results. Invalid requests can be retried.

## Matching and confidence

Build-time dependency: `sharp@0.34.5` (dev dependency only). It creates a 32 × 32 luminance thumbnail for every reference. The browser uses native Canvas and a Vite-bundled Web Worker; no additional browser matching library is required.

1. Decode the selected image, apply the user-selected centered crop, resize to 192 × 192 and compute luminance.
2. Reject very dark or near-uniform photos. Compare normalized 32 × 32 samples at four quarter-turn orientations, with offsets of −8°, −4°, 0°, 4°, 8°, three crop scales and three mild trapezoid sampling adjustments.
3. Use normalized cross-correlation of luminance to find candidates; verify them using central-difference gradient correlation.
4. Score = 0.75 × luminance correlation + 0.25 × gradient correlation. Require luminance ≥ 0.72, gradient ≥ 0.35 and combined score ≥ 0.67. Values below these thresholds produce no result.
5. Keep the best variant per set and show at most three sets. Label the first High Match only at score ≥ 0.86 and a margin ≥ 0.07 above the next set. Otherwise label candidates Possible Match. Identical references on different sets remain ambiguous.

The displayed similarity / 100 is a heuristic visual score, **not a calibrated probability**. Thresholds have synthetic regression coverage and should be revisited using labeled physical-card photos. The matcher accepts pixels and an index and returns matches/issues, so it can be replaced without redesigning the scanner UI.

## Responsive design and border

Search and Scan Backprint stay on one flex row. Search shrinks flexibly, the scanner label stays visible, and both controls are 44 px tall. Mobile reduces gaps/padding and logo width to 90 px, or 72 px at widths ≤390 px. Navigation uses the existing menu control at widths ≤1350 px to reserve room.

A clipped conic-gradient pseudo-element rotates continuously over four seconds; an inset dark pseudo-element covers its center, exposing only the border. Text/icon do not rotate. Hover adds a subtle glow, without layout movement. `prefers-reduced-motion: reduce` disables rotation and leaves a static gradient border.

## V1 limits and testing

This is template comparison, not automatic card detection. Center the card and use Trim background; tightly framed photos work best. Severe blur, glare, occlusion, large perspective angles, arbitrary background, and off-center cards can prevent identification. Low-resolution backprints with very similar layouts can remain ambiguous. The quality checks are conservative heuristics, not a reliable diagnosis of blur or glare.

Camera capture requests the rear camera through `capture="environment"`. Actual behavior depends on the device/browser; desktop may show a file chooser. HEIC/HEIF require browser decoding support; otherwise the user is asked to export JPEG/PNG. Files larger than 20 MB and very small images are rejected. Cancellation terminates matching, ignores stale responses, and releases preview URLs. Network/index/worker failures have retryable errors.

Run with Node ≥22.13 (the repository requirement):

```sh
npm run scanner:index
npm run test:scanner
npm test
npm run typecheck
npm run build
```

The regression suite checks duplicate filenames, variants, compression, resize, quarter turns, slight rotation, lighting, mild blur, dark/blank/noise/unrelated images, ambiguous identical references, and malformed inputs. New files pass targeted Oxlint checks; repository-wide lint has unrelated existing failures.

Before release, exercise real iOS Safari and Android Chrome camera capture, photo permissions/cancellation, landscape mode, portrait widths 320–430 px, keyboard-only navigation, reduced motion, invalid/large files, slow/offline index requests, close-during-scan, and retry. Calibrate false positives/negatives using photos of several printed sets and unrelated objects under varied lighting; synthetic tests do not substitute for this.

Recorded validation: the production build and TypeScript check passed; all 6 scanner tests and 3 core tests passed. A full catalog sweep found the owning set in the top three for all 92 indexed reference images. Headless Chrome tested the built production bundle at 1440, 1280, 768, 390, 375 and 320 px: the search and scanner remained on one row. The upload-to-worker-to-results flow identified D-Best 40 (92/100), used its correct set URL, rejected unrelated artwork/invalid files, restored trigger focus, and disabled border animation for reduced motion. The browser test disabled the unconfigured local production authentication connection; it did not exercise a live backend or physical camera.

Reference generation uses the documented [Sharp resize API](https://sharp.pixelplumbing.com/api-resize/) and [raw output API](https://sharp.pixelplumbing.com/api-output/).
