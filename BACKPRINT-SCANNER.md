# Backprint scanner: live-camera revision

Status: implemented locally; automated checks pass. **Physical-phone recognition is not yet validated.** The five supplied images are UI mockups, not a labeled dataset of failed camera photos. Do not treat synthetic/source-image results as evidence of real-photo accuracy.

## Why V1 missed phone photos

The previous matcher resized a centered crop to 192 px and compared 32 px luminance/gradient templates with an absolute luminance cutoff of 0.72. Background, perspective and imperfect framing shift pixel positions. A correct candidate could be discarded before stronger evidence was available. V1 had no card flattening, local feature descriptors, or geometric verification; source-to-source tests did not cover that gap.

## What is preserved

The existing scanner trigger, single-row mobile header, CSS spectrum border, set IDs/full asset paths, variant mapping, Base UI dialogs, `/?set=` routes, catalog export/index workflow, and existing Search / Explore components are reused. No database schema or live data changes are needed.

## Live mobile experience

The existing <768 px mobile breakpoint gates a lazy camera component. Desktop displays a small mobile-only notice and requests neither camera access, the scanner index nor OpenCV. On mobile, `getUserMedia` requests the rear camera with audio disabled; inline, unmirrored video appears in the scanner.

The five UI states follow the supplied mockups: Ready, Hold Steady, Scanning, Best/Possible Match, and No Match/Timeout. Permission, preparation, error and paused states have retries plus existing Explore/Search actions. No file picker or normal upload/capture buttons remain. A secondary Scan Now appears after 6.5 seconds of visible content; auto-capture remains primary.

Readiness samples a 96 × 144 target crop at 4 Hz. Brightness/contrast, Laplacian detail and frame-to-frame movement are checked separately from identification. A stable usable image for 750 ms triggers capture. Perfect contour detection is not required. The session times out after 30 seconds of ready-camera time. Matching runs once per capture, in a worker.

Closing, Back, either fallback action, hidden tabs, page navigation, errors and completed captures stop camera tracks. Late permission resolutions stop their tracks instead of attaching to a closed scanner. A retry clears capture/results/timers/stability state. OpenCV remains initialized for normal Scan Again; interrupted/hung worker work is terminated. Temporary OpenCV Mats, vectors, matchers, transforms and algorithms are owned by try/finally scopes.

## OpenCV and index

`@techstark/opencv-js@4.12.0-release.1` is a pinned dev/build dependency. A generated same-origin ESM adapter of its 10.9 MB runtime loads only in the mobile scanner worker. The adapter changes the UMD global binding to `globalThis` and exports the runtime; no eval loader, external CDN or AI service is used. The upstream license is included alongside the runtime.

`npm run scanner:index` still reads `lib/catalog.json` plus `supabase/import/public-catalog.json`, discovers backprint siblings in set-specific folders, and includes optional existing-record `backprints` metadata. It now precomputes contrast-normalized grayscale signatures, 24 spatial ORB landmarks per reference, and full ORB descriptors/keypoints. Feature files use content hashes so identical assets share data while retaining all set mappings. No full reference photos are downloaded for matching.

The generated v2 index currently has 92 entries for 79 sets, with 78 distinct feature files. The index is about 252 KB; up to 12 shortlisted feature files are fetched per capture and up to 24 remain cached in the worker. `public/scanner-runtime/` and `public/backprint-features/` are generated, ignored source artifacts and must be present in deployed build output. The existing predev/prebuild hooks generate them automatically. Use Node ≥22.13 with the repository scripts; direct Vite/Vinext invocation requires running scanner:index first.

## Recognition and confidence

1. Capture the actual scanner-frame coordinates from the object-fit-cover video preview, at maximum 720 px working dimension.
2. OpenCV grayscale, Gaussian blur, Canny, morphology, contours and polygon checks look for a plausible centered card. Reliable corners produce a perspective warp. Always retain the known scanner-frame crop as a fallback.
3. Normalize scale and local contrast with CLAHE. Extract up to 800 ORB keypoints/descriptors.
4. Shortlist a union of eight descriptor-sketch candidates and four appearance candidates, deduplicated by feature file. There is **no strict appearance veto**.
5. BFMatcher Hamming distance + ratio test finds distinctive correspondences. RANSAC homography verifies a coherent plane; inlier coverage, projected-card geometry and aligned grayscale correlation reject coincidental local matches.
6. Rank using inlier count, inlier ratio, area coverage, aligned similarity and coarse appearance. Deduplicate variants by set. Compare the winner with geometrically plausible runners-up before calling it strong. Return up to three plausible sets; identical shared artwork stays ambiguous.

Current provisional gates: ≥9 inliers, inlier ratio ≥0.36, coverage ≥0.09 and aligned correlation ≥0.30, with valid geometry. Strong additionally requires ≥18 inliers, ratio ≥0.50, coverage ≥0.18, aligned correlation ≥0.52 and score separation ≥0.12. These are **engineering safeguards awaiting real-photo calibration**, not claimed probability thresholds. Users see Strong visual match / Possible match / No reliable match, never numerical accuracy percentages.

Development-only logs show contour/corners, perspective/fallback use, sharpness, normalized dimensions, candidate names/scores, correspondence counts and classification. Production messages omit diagnostics. Photos are processed locally and are never uploaded.

## Validation and real-photo calibration

Type checking, core tests, six scanner tests, targeted lint checks and the production build pass. Browser checks using simulated camera streams cover mobile auto-capture, normal Scan Again reuse, permission errors, failed OpenCV download/retry, no-match results, late permission cleanup, desktop gating, viewport changes, existing Search/Explore actions, the 30-second timeout and the secondary Scan Now action. Mobile Ready and No Match layouts were visually checked. These checks exercise application behavior, not physical camera accuracy or device performance. Publication for mobile field testing is authorized; physical-phone accuracy remains unvalidated.

`npm run test:scanner` covers index integrity, synthetic perspective/background/shadow/mild-blur cases, contour fallback, unrelated negatives, print ambiguity and readiness/video mapping. A transformed D-Best 40 example had appearance correlation 0.34 (which V1 would reject), but 287 RANSAC inliers, 0.97 inlier ratio, and aligned correlation 0.97; the new pipeline correctly identified it. Deluxe print variants with identical references remained Possible Matches. These fixtures are deliberately labeled synthetic.

To evaluate actual physical-card photos, create a private manifest outside public/:

```json
[
  {"file":"photos/dbest40-angle.jpg","expected":"yuyuhakusho-dbest40","region":{"x":0.1,"y":0.05,"width":0.8,"height":0.9}},
  {"file":"photos/unrelated.jpg","expected":null}
]
```

`region` is optional and uses fractions of the EXIF-oriented photo; omit it for a tightly framed image. `expected` may be an array when multiple set mappings are intentionally equivalent.

Run:

```sh
node --experimental-strip-types scripts/evaluate-backprints.mjs /absolute/path/photos.json /absolute/path/report.json
```

The local report contains each photo, expected/predicted sets, pass/fail, rankings and geometric metrics. The tool neither uploads nor copies private photos to the website. Use 5–10 physical sets with straight/angled/indoor-light photos plus unrelated negatives to tune thresholds. Real devices must additionally validate permission prompts, rear-camera selection, Safari inline playback, motion/glare, repeated scans, backgrounding, low memory and mobile network startup.

## Limits

Severe blur/glare, faded low-detail cards, partial occlusion, extreme perspective, incorrect frame alignment and identical artwork can still prevent unique identification. ORB on clean source references cannot restore missing physical print detail. The first mobile open downloads OpenCV; slow networks have a recoverable preparation timeout. Desktop webcams are intentionally unsupported.

Primary API references: [OpenCV.js package](https://github.com/TechStark/opencv-js), [feature matching and homography](https://docs.opencv.org/4.13.0/d1/de0/tutorial_py_feature_homography.html), [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
