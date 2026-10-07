# Paper — Camera-based Drawing Assistant

**Trace the structure. Create the rest.**

## Product definition

Personal Web App / PWA, opened directly in iPhone/iPad Safari. Assist with composition, object outlines/proportions and major feature positions. Stop using the app after the structural drawing; color, brushwork and details remain the user's creation.

The paper is the persistent coordinate system. Camera frames observe that paper temporarily. No ARKit, world tracking, automatic paper detection or AI contour conversion in the first MVP. Manual registration needs flat paper, visible corners and a fixed camera.

## Current state

M0–M4 implementation is available. Automated checks pass; physical-device and browser acceptance are still NOT TESTED. The user's 2026-10-07 instruction authorized continuing the remaining MVP implementation despite those pending gates. This does not count as passing them.

| Milestone | Scope | Current verification |
|---|---|---|
| M0 | Product, architecture, UX, repository, milestones | Documented |
| M1 | Rear-camera preference, inline contain preview, four corners, homography, grid | Math and camera mocks PASS; hardware pending |
| M2 | Photo import, paper-based move/pinch/rotation, opacity, lock, clipping | Geometry, gesture and DOM tests PASS; Safari rendering/touch pending |
| M3 | IndexedDB save/resume, autosave, portable backup | Commit/abort adapters, UI races, backup and DOM resume PASS; browser durability pending |
| M4 | PWA manifest/icons, shell cache, focus/fullscreen/wake lock | Worker VM and lifecycle tests PASS; actual installation/offline/auth pending |

## Technical architecture

Buildless HTML/CSS/ES modules, no external JS CDN, backend or image-upload API. Camera, geometry, reference transforms, renderer, gestures, persistence and PWA lifecycle are separate modules.

### Coordinate chain

Image pixels → reference transform in physical paper metric → normalized paper → homography → normalized camera → contain viewport → CSS pixels.

- Image pixels: decoded orientation, downsampled with aspect preserved.
- Paper: configured width/height and normalized reference center/width.
- Camera: corners divided by video width/height, never mirrored.
- Viewport: contain mapping and touch coordinates; canvas DPR is separate.

Persist `centerU=x/paperWidth`, `centerV=y/paperHeight`, `widthU=referenceWidth/paperWidth`. Image aspect determines height. Rotation and pinch occur in physical paper metric (u × paperWidth, v × paperHeight), avoiding distortion on A4. Positions are not saved as screen pixels.

### Registration and renderer

A=(0,0), B=(1,0), C=(1,1), D=(0,1) map to selected camera corners. Solve eight unknowns with h33=1 using pivoted Gaussian elimination. Reject non-finite, crossed, collapsed, nonconvex or tiny quads.

Camera uses contain, not crop. Inverse homography converts pointer input back to paper. CSS matrix3d combines image-to-paper, paper-to-camera and viewport transforms; the image layer is clipped to the projected paper polygon. Reject reference corners behind the projective horizon. Reference lock prevents composition edits; it does not track camera movement.

Four corners do not determine the paper's physical aspect ratio; choose the correct configuration. Curved paper, lens distortion and imprecise corners remain error sources. True CSS projective rendering on Safari still needs visual validation; use a different renderer if that validation fails.

### Session schema v1

A single IndexedDB `sessions` object store holds one atomic value per Session:

```json
{
  "schemaVersion": 1,
  "id": "uuid",
  "name": "Portrait",
  "createdAt": "ISO UTC",
  "updatedAt": "ISO UTC",
  "paper": {"width": 210, "height": 297, "unit": "mm", "orientationAnchor": "A"},
  "transform": {"centerU": 0.31, "centerV": 0.22, "widthU": 0.46, "rotationRad": 0.34, "opacity": 0.37, "locked": true},
  "hidden": false,
  "image": {"kind": "photo", "name": "reference.jpg", "width": 900, "height": 1200, "blob": "IndexedDB Blob, not a string"},
  "lastRegistration": null
}
```

`lastRegistration`, when present, contains normalized camera corners, homography, source (`camera` or `demo`), camera frame dimensions and capture time with `diagnosticOnly:true`. It is historical information only. The built-in vase uses `kind:sample-vase` with its bundled asset, not a temporary object URL.

Save resolves on transaction completion, not request success. Failed replacements keep the previous committed image and metadata. Explicit save names/creates a Session; subsequent edits autosave after 750 ms. A revision counter prevents changes made during an asynchronous save from being marked saved. Save failure leaves changes dirty and visible; do not retry endlessly on quota errors. Before switching, attempt to save or ask whether to discard the remaining changes. Do not rely on unload transactions.

Resume loads/validates the record and decodes its image before replacing the current drawing. It stops the camera, cancels pending image import, resets active corners/homography and restores paper/reference state. New A–D corner selection is mandatory before the overlay becomes visible. Session position, size, rotation, opacity and lock remain unchanged.

Portable `.paper.json` backups contain metadata and base64 image bytes with MIME type. Validate versions, ranges, sizes and image kinds. Restored photos must decode with the saved dimensions. Imported backups receive a new ID, preventing accidental overwrite of an existing local Session. Photos stay local and are not included in GitHub.

Storage is per origin/browser/app, not cloud sync. Safari and Home Screen storage sharing is not assumed. Browser data deletion/eviction and private browsing can remove data. Request persistent storage where available, but it is not a backup. Multiple tabs editing the same Session use last-write-wins; no conflict merge is implemented.

### Camera lifecycle

HTTPS top-level context, explicit user click, video only, `facingMode:ideal environment`, muted/autoplay/playsinline. Rear facing is a preference; an acquired front camera gets a warning.

Visibility loss/pagehide stops camera tracks and invalidates alignment. Resume requires an explicit camera restart. Request generation prevents a delayed permission response from keeping a stream alive after suspension. Camera frame dimension/orientation changes invalidate registration. Viewport resize and focus/tool layout changes only recompute contain mapping.

### PWA and focus

Relative manifest `id`, scope and start URL; standalone display, theme colors, 192/512 PNG icons and Apple touch icon. Safari installs through Share → Add to Home Screen; installation is not verified in this environment.

Focus mode uses the available viewport, safe areas and a tools panel. Fullscreen and Screen Wake Lock are optional enhancements. Failure/unsupported APIs do not interrupt drawing. Wake locks are released on backgrounding; stale asynchronous acquisitions are immediately released.

A versioned service worker caches a complete set of 16 static app-shell files. Installation rejects redirect/login HTML and validates expected MIME/content. No auth/API routes, Session records or reference photos are cached by the worker. Online navigation passes through live sign-in/denial pages; after a valid app response it serves its consistent cached app version. A network failure can serve the cached shell offline. Updates wait until the user saves and explicitly requests activation; no automatic reload of a dirty drawing. Bump the shell version when changing any cached asset.

Private Sites audience stays owner-only. Offline shell access uses previously cached local files and cannot perform a fresh server authentication check. Real private-host service-worker registration, Home Screen sign-in and offline startup must be tested; repair deployment if needed rather than claiming they work or changing visibility without authorization.

## UX

Select/resume → paper configuration → camera → A–D → confirm → move/pinch/rotate → lock → focus → save.

Three tool tabs: paper, reference, drawings. Four viewport quick actions: lock, show/hide, re-align, save. Session list shows project names and modified dates. Inline save status distinguishes unsaved, saving, committed and failed. Keep matrix/debug details out of the drawing flow.

## Repository

```text
dist/
  index.html / style.css / app.js
  manifest.webmanifest / sw.js
  assets/                 vase and app icons
  lib/
    homography.js         pure math / contain mapping
    reference.js          photo decoding / paper transform
    gestures.js           physical-paper gestures
    renderer.js           projective image layer
    camera.js             stream lifecycle
    sessions.js           schema / IndexedDB / backup codec
    session-ui.js         project actions / autosave
    pwa.js                installation/update / wake lock
  project-plan.md         this document's deployed copy
docs/                     architecture and M1–M4 device checklists
tests/                    Node regression tests and controlled adapters
scripts/check.mjs         syntax / HTML IDs / static / manifest checks
package.json              dependency-free development commands
```

Site-specific hosting config and credentials are excluded from public GitHub. The Sites repository preserves its hosting manifest; GitHub holds portable source and documents. Do not store private photos, user Sessions or credentials in either source tree.

## Verification and next step

37 Node tests and static/syntax checks across 10 JS files pass. See TEST_STATUS.md for the distinction between controlled adapters and real browser behavior. No actual Safari/IndexedDB/camera/touch/OS eviction was tested here; no browser screenshots were available.

Run M1/M2/M3/M4 checklists separately on iPhone and iPad, Safari and Home Screen, including a next-day Session restoration under a different camera angle. Fix observed errors, then mark MVP accepted. Do not add Phase 2–4 before this workflow is useful for real drawing.

Later: automatic paper detection and alignment snapshot; simplified major contours with adjustable complexity; evaluate ARKit/depth/AI from actual usage.

## Primary technical references

- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event
- https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
- https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

Updated 2026-10-07. MVP implementation ready for device testing; device acceptance remains open.
