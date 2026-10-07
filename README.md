# Paper — Camera-based Drawing Assistant

**Trace the structure. Create the rest.**

Personal Web App / PWA for composition, proportions and major outlines. The paper is the persistent coordinate system. Colors, brushwork and detail remain your own work.

M0–M4 implementation is available; iPhone/iPad acceptance is still **NOT TESTED**. This is a testable MVP, not a claim of verified Safari compatibility.

## Try it

- Owner-private test deployment: https://bonnie-paper-drawing-assistant.chiao-shan.chatgpt.site
- Source: https://github.com/BonnieLo/camera-drawing-assistant

Open in top-level iPhone/iPad Safari over HTTPS. The current deployment requires the owner's ChatGPT sign-in. Public GitHub source does not change the test site's audience.

1. Choose a photo or the bundled vase sample.
2. Open the rear camera, select a paper configuration and fix the device in place.
3. Select A top-left, B top-right, C bottom-right, D bottom-left; confirm the grid.
4. Move, pinch, rotate and adjust opacity; lock the reference and enter focus mode.
5. Open **My drawings / 我的作品**, name and save the Session. Wait for **Saved / 已保存**.
6. On return, select the Session and resume. Open the camera and register the **same physical A–D corners**. Old camera homography is never used for live alignment.

## Features

- Rear-camera preference, inline preview, camera suspension and manual re-registration
- Four-corner homography; reference overlay clipped to the paper
- Paper-coordinate move, pinch zoom, rotation, opacity, lock/unlock and fine adjustment
- IndexedDB Session save/resume, names, modified times, save-as-copy and deletion
- Debounced autosave after the first successful explicit save; errors remain visible
- Portable `.paper.json` export/import including photo bytes; imports create a new Session
- PWA manifest, Apple touch icons and versioned app-shell service worker
- Focus layout, optional Fullscreen API and Screen Wake Lock where available
- No backend, dependencies, image upload, ARKit, AI detection or automatic camera tracking

## Local development

```sh
npm test
npm run check
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000 for desktop/demo use. A physical iPhone/iPad camera requires HTTPS; a plain LAN HTTP address is insufficient. To use another static HTTPS host, deploy the contents of `dist/` and serve JavaScript, PNG and the web manifest with their proper MIME types. The manifest, icons, sample and worker scope use relative paths.

## Persistence and offline use

Sessions are local to this origin and browser/app storage; no cross-device cloud sync. Do not assume Safari and a Home Screen app share storage. Export/import a backup when changing device, browser, Home Screen mode or host.

In Safari choose **Share → Add to Home Screen**. First open while online, authenticate if required and wait for the offline-ready message. The service worker caches a complete version of static app files, rejects redirected/sign-in HTML and ignores auth/API routes. Live sign-in/denial responses pass through; a network failure falls back to the locally cached app. Offline access uses already stored local files, not a fresh server sign-in. Do not rely on it to enforce account authentication while offline.

Browser eviction or clearing site data can remove local Sessions and caches. Save completion is not a backup. Export important drawings before closing. Autosave is best effort, especially during abrupt OS termination. Updates require explicit action and block reload while the current drawing is unsaved.

## Validation

37 Node tests pass: numeric perspective/gestures, camera lifecycle, DOM-stub import/re-registration/focus flow, backup round trips, atomic commit/abort simulation, Session UI races, offline shell, sign-in exclusion, update policy and wake-lock races. Syntax/static checks cover 10 JavaScript files. IDB and service-worker tests use controlled adapters, not a real browser.

Real Safari camera, IndexedDB durability, EXIF/HEIC, CSS perspective, touch, Home Screen installation, private-site authentication/offline startup and device sleep/recovery remain **NOT TESTED**. Follow the device checklists; do not mark a milestone accepted solely from Node tests.

## Project documents

- [Product, architecture and milestones](docs/PROJECT_PLAN.md)
- [M1 camera/registration checklist](docs/M1_DEVICE_CHECKLIST.md)
- [M2 reference/gesture checklist](docs/M2_DEVICE_CHECKLIST.md)
- [M3 Session checklist](docs/M3_DEVICE_CHECKLIST.md)
- [M4 PWA/device checklist](docs/M4_DEVICE_CHECKLIST.md)
- [Acceptance record](docs/TEST_STATUS.md)

`dist/` contains the deployable app; `dist/lib/` holds geometry, camera, renderer, gestures, sessions and PWA modules; `tests/` contains regression tests. Photo processing limits: source file 40 MB, decoded image 60 MP, working image longest edge 2048 px; stored photo Blob 16 MB, imported backup 24 MB.
