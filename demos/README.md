# Demo entry pages

Maintained HTML entry pages live here. Open `/demos/` for the scene/camera example,
or use the navigation at the site root. Inventory examples are in `inventory/`,
capability game examples in `games/`, and diagnostic tools in `tools/`.

Implementation modules and assets keep their existing owners under `examples/`,
`games/` and `apps/`; the browser build stays under `dist/`. Asset URLs resolve
from the owning module, independent of the page's directory depth. Farwake's real
entry point remains `/games/ship/`.

These are runnable examples today. How-to explanations and code examples can be
added here after the structure and code cleanup are settled. The active work
sequence is in [the game plan](../docs/GAME-PLAN.md).
