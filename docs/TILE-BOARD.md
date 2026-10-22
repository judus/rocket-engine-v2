# Second consumer: editable tile board

Open `/demos/tiles.html` from the existing development server. The arm demo links to it and remains available at `/`.

This checkpoint validates the existing composition/input/view contracts with finite spatial data before adding engine storage abstractions, indexing or rendering caches.

## Data and presentation

`examples/TileBoard.ts` is an ordinary host-owned model: 16 × 10 cells spanning x = -8…7 and y = -5…4, with three terrain states in a dense Uint8Array. Tile size is 32 world units. Signed coordinates convert to a nonnegative array offset by subtracting the lower bounds; negative array properties are never used. Point lookup uses Math.floor(), so a small negative world coordinate selects cell -1. Upper boundaries are exclusive. Invalid points/edits are ignored and do not advance the revision.

`examples/createTileBoard.ts` receives the model directly and returns a presentation node plus an edit capability. It translates a world point through the node's inverse ancestor transforms before selecting a cell. Drawing reads the model; it does not change data. The model imports no engine code. Disposing the presentation leaves model data available to its host.

The demo's scene owns the presentation subtree and its InputScope. Each view owns one input binding. Published presses are processed in the scene update before either view draws. Both views read the same board; edits are not duplicated by rendering. WASD/arrows pan both cameras with seconds-based speed; each view retains its own zoom. Selection is shared, rather than per-view hover state.

## Ownership exercises

- Click through either camera to cycle slate → mint → sand → slate.
- Click outside the finite board: no edit.
- Close detail view: its canvas, capture and listeners are released; edits and the world view remain, with no presentation cleanup.
- Reset board: dispose the old application, scene, subtree and input bindings, then create fresh data and all three canvases. The cleanup counter advances once per old presentation.

The counter measures presentation cleanup; it does not imply that JavaScript data requires explicit deallocation or that edits persist after a reset. There is no save/reload feature yet.

## Findings and next decision

This consumer needed no new engine APIs. Explicit dependency injection, Scene2D composition, world-to-local conversion, frame snapshots and independent view disposal were sufficient. There is no demonstrated ownership gap to patch for this slice. Arbitrary draw callback mutation remains an existing documented boundary, rather than something this example can prove absent.

At this checkpoint the board repainted every tile through each view. At 160 cells that kept the example simple; it is not evidence of large-world performance. There is also no object spatial index: dense cell lookup already gives direct access to the clicked tile. Adding a uniform-grid object index here would solve no demonstrated query problem.

Next, a larger board or moving/selectable objects can justify bounded region caching or indexing respectively. Cache ownership, revision invalidation and reuse across cameras should then be measured with render counters and edits crossing region boundaries. Streaming, persistence and physics remain separate milestones.

## Verification

Strict TypeScript, type-aware lint, formatting, build and all 56 emitted-JavaScript tests pass. New checks cover signed/exclusive boundaries, dense-array row separation, terrain wrap/revisions, ancestor transforms, presentation cleanup retaining host data, and input from two differently zoomed cameras updating shared data once. Removed-view listeners stop accepting edits while the surviving view continues.

Browser checks cover actual Canvas output, selecting the same negative tile through both cameras, view removal and continued editing, reset cleanup and keyboard panning. These checks do not establish cross-browser support, large-board capacity or cache performance.

## Independent presentation checkpoint

The third canvas is an activity dashboard, rather than another camera on the tile artwork. Its plain draw-only scene receives the exact same TileBoard instance through createTileSummary(). The model exposes current terrain counts; active means mint or sand. No state copy, synchronization listener or second update loop is used. The editor scene handles input once; all scene updates finish before all views draw, including the counter. Rendering the dashboard never advances the board revision.

This proves shared data with independent presentations using today's API: two views share the editor Scene2D, and a third view has a separate read-only presentation scene. It does not add per-view renderers to Scene2D. Closing detail leaves the counter and editor running; reset disposes every canvas and creates one new shared model. Counter tests cover slate → mint → sand → slate, unchanged revision while drawing, and visibility of edits from either camera, including after detail disposal.

## Subsequent cache slice

The live demo now uses a 128 × 80 board (10240 cells), a scene-owned bounded terrain cache and viewport culling. Counts are maintained during edits, so the independent activity presentation stays cheap as the board grows. The original 16 × 10 defaults remain useful for model tests. The three-presentation relationship is unchanged. See [TILE-CACHE.md](TILE-CACHE.md) for current cache contracts and verification.
