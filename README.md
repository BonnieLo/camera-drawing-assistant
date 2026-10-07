# Paper — Camera-based Drawing Assistant

Trace the structure. Create the rest.

Current milestone: **M2 reference editing**, with manual paper registration. This app supports composition, proportions and major outlines; colors and details remain your own work.

## Available

- Rear-camera preference and inline Safari preview
- Manual four-corner paper registration and perspective grid
- Local photo import; maximum working-image dimension 2048 px
- CSS projective image overlay clipped to the paper
- Paper-coordinate move, pinch zoom and rotation
- Opacity, width, angle and position controls
- Lock/unlock, show/hide and a built-in vase sample
- Recalibration preserves the reference transform while this page remains alive

**Save/Resume and PWA/offline are not implemented.** Reloading, closing or OS eviction of the page loses the current image and composition. Keep the camera fixed; manual registration does not track movement.

## Project documents

- [Product and architecture](docs/PROJECT_PLAN.md)
- [M1 device checklist](docs/M1_DEVICE_CHECKLIST.md)
- [M2 device checklist](docs/M2_DEVICE_CHECKLIST.md)

## Local use

No dependencies or build step.

```sh
npm test
npm run check
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000 for a desktop demo. Physical-device camera requires an HTTPS top-level page; a LAN HTTP address is insufficient. The current Sites deployment is owner-private. Source and project documents: https://github.com/BonnieLo/camera-drawing-assistant.

## Verification

22 Node tests pass, including numerical geometry, gesture state, camera lifecycle mocks and a DOM-stub workflow regression. Syntax and static references pass across 6 modules. These do not replace browser QA: real Safari camera, file-picker/EXIF/HEIC, CSS projective rendering and iPhone/iPad multi-touch remain unverified.

## Repository

- `dist/`: deployable Web App and self-authored sample
- `dist/lib/`: camera, geometry, reference transform, renderer and gesture modules
- `docs/`: architecture, milestones and device acceptance checklists
- `tests/`: automated regression tests
- `scripts/`: dependency-free checks

Next: M1/M2 physical-device acceptance, then M3 IndexedDB sessions and resume, then M4 PWA and device regression.
