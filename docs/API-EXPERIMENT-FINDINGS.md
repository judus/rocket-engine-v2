# API ergonomics: findings

Branch `experiment/api-ergonomics` is ready for design review, not merged into main.
Implemented API: [API-EXPERIMENT.md](./API-EXPERIMENT.md).
Runnable demo: [api-experiment.html](http://127.0.0.1:8092/api-experiment.html).

## Second-pass update

Julien authorized the scene-composition pass after Steve’s review #681. It is now
implemented: [contract, API and evidence](./SCENE-ACTIVATION.md), with the new
[interactive two-scene demo](http://127.0.0.1:8092/scene-composition.html).
The route-service activation limitation discussed below describes the first-pass
snapshot; it is addressed by activeChildren + synchronous service notification and
facade-owned input bindings. No promotion/merge to main accompanies this experiment.

## What improved

A small callback program now needs only createApp and its update/render callbacks.
The default view/scene/target remain accessible and readiness has an explicit Promise.
Adding a tracked object returns the existing Node2D, so ordinary transforms, children,
behaviors and disposal remain available. Layers and camera follow are optional.
The navigation prototype makes retained/fresh ownership and failed preparation visible
without requiring users to coordinate app-wide stop/start cycles.

These are ordinary facades/objects over Rocket's current runtime. This investigation
found no reason to replace its clock, input service, transform trees or renderer.
Julien explicitly allowed redesign on this branch; retaining these foundations was a
choice supported by the working consumers, not a restriction imposed on the experiment.

## Concrete comparison

Read-only legacy examples inspected:

- `/home/maduser/workspace/rocket-engine/examples/002-simple-animation-inline-scene/main.js`
- `/home/maduser/workspace/rocket-engine/examples/005-scene-navigation/main.js`
- `/home/maduser/workspace/rocket-engine/examples/003-simple-animation-with-layers/SimpleAnimationWithLayers.js`

Legacy small animation requires Rocket construction, stack setup/addScene, dimensions
and launch. Current explicit v2 uses new Rocket → scene → view → await start. The
experimental consumer uses createApp({ update, render }) → await ready. This removes
setup objects for the first example while exposing the same engine/view underneath.
It deliberately uses a factory name rather than replacing the exported Rocket class
with a callable function. No compatibility migration was attempted.

Legacy navigation goes through sceneManager(stack).next/previous over an ordered set.
The experiment navigates named factories and records successful navigation history;
that previous operation is deliberately history-based. It is not a compatibility claim.
Legacy layer setup subclasses BaseScene and initializes class-based layer objects.
The experiment permits one named Node2D container plus direct node draw callbacks,
with ordinary child trees for larger objects. It does not allocate a canvas per layer.

## Evaluation by concept area

| Area                        | Result                                                                                                                    | Deliberately left aside                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Minimal application         | Implemented createApp, implicit canvas/scene/target, queued startup, explicit readiness/errors and deferred startup       | Global defaults/container magic, hidden DOM-ready delays                                                                             |
| Scene lifecycle             | Implemented named factories, retained/fresh scenes, history, preparation, latest-request cancellation and owned cleanup   | enter/leave/pause/resume hooks need clear failure/side-effect semantics; no arbitrary async hook rollback                            |
| Entities                    | Implemented IDs, immutable tags, snapshots and behavior convenience over real Node2D                                      | Collider/body sugar needs explicit transform and physics ownership; fast-projectile sweeps remain separate from discrete collisions  |
| Layers                      | Implemented ordered world/screen groups, stable feet-Y or custom sorting and multipart nodes                              | Layer caching needs invalidation/content contracts and a measured consumer; not added for API appearance                             |
| Cameras                     | Implemented top-down follow over Camera2D, bounds, zoom and refresh-independent smoothing; real scoped input demonstrated | Platformer dead zones and 3D orbit/first/third-person framing need separate policies. No misleading catch-all preset                 |
| Parallax                    | Implemented independent translation factor with finite procedural scenery demonstration                                   | Image-size/repeat/edge API is undecided; ordinary callbacks remain available. Decorative parallax does not change picking or physics |
| Primitive/tween convenience | Existing Node3D + mesh + transform are the appropriate objects; existing Node2D behaviors can animate local properties    | No second animation scheduler or universal scene.add.cube facade across incompatible 2D/3D presentations                             |

## Tradeoffs that remain visible

The small node index intentionally scans a scene-local collection. It is not a spatial
index or ECS replacement. Direct advanced root operations are not automatically indexed.
The API uses x/y rather than a new position object because Node2D already owns those
transforms. Metadata unregisters on disposal; detached nodes follow the caller-ownership
contract. Simple code should not receive a copied wrapper transform that can diverge.

Stage2D separates world and screen through two existing Scene2D trees and one View
(with an overlay), not two canvases. The explicit drawing adapter supplies the camera;
there is no global current-view service. This makes per-view parallax possible but
means a raw Stage is not itself a complete presentation. Naming and whether this
adapter belongs directly on View deserve review before promotion.

The first pass left routed Input/service activation unresolved. The second pass now
publishes active child scopes to app services, immediately notifies activation changes,
and provides named navigation plus scene-owned input through createApp. The dedicated
SCENE-ACTIVATION.md describes those implemented contracts and their limits. App-scoped
services are not restarted for each room, and child simulation remains parent-delegated.
This closes the specific composition gap Steve identified without a second scheduler.

Synchronous hooks remain synchronous. Loading may be asynchronous. Cancellation waits
for a noncooperative load to settle so its eventual resources can be released. Cleanup
errors after a committed switch report that failure without promising rollback. These
are observable contracts rather than concealed retries or guessed recovery paths.

## Evidence and review request

Eight focused tests cover node identity/query/ownership, world versus screen drawing,
parallax translation, feet ordering after movement, camera half-life/bounds, retained
identity/fresh recreation/history, failed/superseded preparation, cancellation during
disposal, minimal startup/deferred startup/readiness failure/DOM cleanup and explicit
fixed forwarding. The complete gate passes 454 tests, TypeScript, lint, format, build
and raw per-module coverage floors. Experimental modules have their own initial floors;
existing consolidated floors were not lowered. Coverage reports remain in coverage/.

Native browser: movement changed hero X from 480 to ~600 using a held focused key;
HUD remained fixed, feet sorting and parallax visibly worked. Fresh → previous restored
Home instance 1; failed load kept Home; Slow → Fresh cancelled and released the loading
candidate. Normal browser console showed no errors. This is focused in-app Chromium
verification, not a device/browser support matrix. Pause/resume, removal from 16
to 15 trees, and final disposal were also checked: both canvases removed, three route
instances created and three disposed. Screenshot: `/tmp/rocket-api-experiment.png`.

Steve: review whether these conveniences improve actual consumers, especially the
Stage/View boundary, named navigation/history semantics, route-service activation gap,
ownership clarity, naming/defaults and error behavior. Review reusable implementation
and evidence separately from the small demonstration's artwork. Suggest the next API
change; the experiment remains isolated for that discussion.
