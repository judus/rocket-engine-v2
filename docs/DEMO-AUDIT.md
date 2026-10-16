# Demo audit — 16 October 2026

Audited merged main (`ed405d0` baseline) in the native in-app browser at
http://127.0.0.1:8092. The audit covers **64 HTML pages / 67 demo destinations**
(the factory page has four modes). No engine or imported-package runtime defect
was confirmed in this pass.

## Corrections

- Added the omitted object-inventory, atomic-operations and journal demos to the
  shared navigation. Inventory examples now progress from basic storage through
  transactions to context/equipment; journal continuity follows the watchtower.
- Fixed the Rocket copy's inventory “Production Workshop” back-link:
  `index.html` → `../../workshop.html`. Reported the import-path correction to
  Production-Workshop in message 689; peer core/source was not changed.
- Browser cache served the old inventory document once. A fresh document request
  verified the repaired link navigates to workshop.html. Sidebar has 67 links.

## Verification

- `npm run check`: **462 tests passed**, coverage gate passed, strict TypeScript,
  lint, formatting and build passed. Log: `/tmp/rocket-all-demos-check.log`.
- All 64 originally listed destinations loaded; no captured console error or
  warning. Added three unlisted pages to the browser audit.
- All ten software 3D pages recreated and reported one cleaned previous scene.
- All 19 WebGL pages reached ready state, recreated and recovered from context
  loss. Eighteen offer pixel diagnostics: 16 report PASS; triangle reports a
  non-background RGBA sample/GL error zero; meshes confirms depth-on order
  independence and depth-off order dependence/GL error zero. Asteroid-only page
  has no pixel diagnostic. All diagnostics report GL error zero.
- Sprite layer proof: **230 assertions, ten cycles, 30 released canvas sources**.
- Native worker terrain: injected chunk failure observed, explicit retry reached
  **228/228 ready**, zero failed/queued/occupied jobs, `Error: none`.
- Runtime/physics/view recreation and disposal, terrain travel, navigation
  assignments/cancellation, character takeover/release, dialogue panels and
  in-memory inventory checkpoints exercised through existing controls.
- Character keyboard movement: x128 → x161.3; typing `d` into the focused ChatBox
  kept x161.3, verifying focus ownership.
- Journal: blue ending in A selected red in B; two confirmed reports and both
  beacons lit, using ordinary game/CFW handlers with no model call.
- Static scan: 369 local HTML src/href references across all pages; one broken
  back-link found and repaired. Final rescan: 369 references, zero missing targets.

The initial sweep intentionally records loading placeholders. Follow-up checks
waited for readiness and exercised asynchronous pages. Script attempts against a
collapsed sprite-proof disclosure, paused Workshop controls and a hidden factory
inspector were UI-test precondition errors, not product defects; applicable tests
were rerun after expansion/resume. The supply action was not forced through the
hidden inspector. A first fault injection during ongoing chunk turnover was
superseded; injection after settlement produced the failure/recovery evidence.

## Per-demo coverage

| Destination                                 | Browser check                                                     |
| ------------------------------------------- | ----------------------------------------------------------------- |
| index.html                                  | Ready and selected controls exercised                             |
| fixed.html                                  | Ready and selected controls exercised                             |
| physics.html                                | Ready and selected controls exercised                             |
| api-experiment.html                         | Ready and selected controls exercised                             |
| scene-composition.html                      | Ready and selected controls exercised                             |
| tiles.html                                  | Ready and selected controls exercised                             |
| streaming.html                              | Ready and selected controls exercised                             |
| terrain.html                                | Ready and selected controls exercised                             |
| terrain-tiles.html                          | Ready and selected controls exercised                             |
| terrain-streaming.html                      | Ready and selected controls exercised                             |
| camera-terrain.html                         | Ready and selected controls exercised                             |
| terrain-workers.html                        | Ready and selected controls exercised                             |
| sprites.html                                | Ready and selected controls exercised                             |
| sprite-layers.html                          | Ready and selected controls exercised                             |
| navigation.html                             | Ready and selected controls exercised                             |
| navigation-streaming.html                   | Ready and selected controls exercised                             |
| ui-panels.html                              | Ready and selected controls exercised                             |
| ui-chat.html                                | Ready and selected controls exercised                             |
| examples/inventory/context.html             | Ready and selected controls exercised                             |
| workshop.html                               | Ready and selected controls exercised                             |
| factory-terrain.html                        | Ready and selected controls exercised                             |
| factory-terrain.html?transport=1            | Ready and selected controls exercised                             |
| factory-terrain.html?transport=1&workshop=1 | Ready and selected controls exercised                             |
| navigation-workshop.html                    | Ready and selected controls exercised                             |
| navigation-workshop-streaming.html          | Ready and selected controls exercised                             |
| navigation-staffing.html                    | Ready and selected controls exercised                             |
| factory-terrain.html?stress=6000&range=128  | Ready and selected controls exercised                             |
| character-dialogue.html                     | Ready and selected controls exercised                             |
| character-sprites.html                      | Ready and selected controls exercised                             |
| character-control.html                      | Ready and selected controls exercised                             |
| character-work.html                         | Ready and selected controls exercised                             |
| character-situations.html                   | Ready and selected controls exercised                             |
| character-grove.html                        | Ready and selected controls exercised                             |
| character-encounter.html                    | Ready and selected controls exercised                             |
| quest-consumer.html                         | Ready and selected controls exercised                             |
| 3d-grid.html                                | Ready, recreate, old scene cleaned                                |
| 3d-cube.html                                | Ready, recreate, old scene cleaned                                |
| 3d-solid.html                               | Ready, recreate, old scene cleaned                                |
| 3d-cockpit.html                             | Ready, recreate, old scene cleaned                                |
| 3d-overlay.html                             | Ready, recreate, old scene cleaned                                |
| 3d-foundation.html                          | Ready, recreate, old scene cleaned                                |
| 3d-visibility.html                          | Ready, recreate, old scene cleaned                                |
| 3d-model.html                               | Ready, recreate, old scene cleaned                                |
| 3d-lighting.html                            | Ready, recreate, old scene cleaned                                |
| 3d-point-light.html                         | Ready, recreate, old scene cleaned                                |
| webgl-triangle.html                         | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-meshes.html                           | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-lighting.html                         | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-textures.html                         | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-materials.html                        | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-material-maps.html                    | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-normals.html                          | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-environment.html                      | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-shadows.html                          | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-dynamic-textures.html                 | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-bloom.html                            | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-asteroids.html                        | Ready, recreate, context loss/restore                             |
| webgl-cockpit.html                          | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-cockpit-environment.html              | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-cockpit-shadows.html                  | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-cockpit-displays.html                 | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-cockpit-bloom.html                    | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-cockpit-spill.html                    | Ready, recreate, context loss/restore and pixel diagnostic        |
| webgl-cockpit-asteroids.html                | Ready, recreate, context loss/restore and pixel diagnostic        |
| journal.html                                | Episode A blue → Episode B red; two reports, both beacons lit     |
| examples/inventory/inventory.html           | Transfer, capacity change, checkpoint restore; repaired back-link |
| examples/inventory/operations.html          | Trade, gather, fill, eat, refused transfer, checkpoint restore    |

## Evidence and limits

[Recorded browser observations](evidence/demo-audit-2026-10-16.json). Full temporary
capture: `/tmp/rocket-all-demo-browser-evidence.json`.

This is a functional regression audit, not every control permutation, every quest
branch, an endurance/performance benchmark, or a browser/device compatibility
matrix. No paid generation, external provider or deployment was invoked. Existing
browser saves were read; no persistent checkpoints were overwritten or deleted.
Inventory checkpoint tests use their own in-memory demo state. Optional live quest
generation was intentionally not exercised. Automated tests complement these
browser checks; they do not prove every rendered scene or GPU driver correct.
