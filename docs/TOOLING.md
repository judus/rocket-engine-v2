# TypeScript and checks

Runtime (`src/`), example (`examples/`) and tests (`tests/`) are TypeScript source. `tsc` emits JavaScript ES modules, declarations and source maps under `dist/`, preserving folder layout. The root index.html loads `dist/examples/main.js`. The package entry points target `dist/src/index.js` and its declarations. There is no bundler or browser runtime dependency.

## Commands

```sh
npm ci               # reproducible development dependency installation
npm run check        # typecheck → lint → format:check → build + runtime tests
npm start            # build, then serve on http://127.0.0.1:8092/
npm run dev          # watch/rebuild; use alongside the running HTTP server
npm run format       # apply formatting
```

`npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` are available separately. Reload the browser after a watch rebuild. Build outputs and node_modules are ignored by Git and the formatter. The dependency lockfile is committed-ready; no Git repository has been initialized here.

## Analysis contract

The shared tsconfig enables strict mode, checked indexed access, exact optional properties, unused local/parameter checks, explicit return-path checking and switch fallthrough checking. Imports preserve native ES module semantics. Emission is blocked by type errors. Both checking and building include runtime, demo and tests.

Type-aware ESLint rejects explicit any, unsafe operations flowing from any, floating promises and Promise misuse in synchronous callback positions. TypeScript and typescript-eslint versions are pinned to a compatible pair; upgrades must retain peer compatibility and pass the complete check.

Prettier verifies TypeScript, tooling configuration, HTML, CSS and Markdown. Checks report formatting differences without writing; the format command applies changes. These check commands exit unsuccessfully on violations and are suitable for a future CI job.

## Public callback types

Frame update/draw/overlay hooks and node cleanup return undefined rather than void. TypeScript's void callback compatibility can allow async functions, so undefined makes this synchronous boundary explicit. Contextually typed inline hooks need no written return. Standalone drawing helpers can annotate their return as undefined. Scene preparation and application-owned scene cleanup retain void | Promise<void>.

Frame, Point, Scene, Behavior, node/scene/view/application options and performance snapshots are exported types. Scene registration and behavior attachment preserve custom state/capabilities, including their this context. No base behavior class or runtime registration wrapper is required.

## Verification

The 44 contract tests run against emitted JavaScript, not only TypeScript source. Compile-only consumer examples in tests/types.contract.ts check preserved custom state and rejection of invalid coordinates/async hooks; @ts-expect-error makes unexpected permissiveness a checking failure. Existing runtime rejection tests keep those annotations so JavaScript callers still receive runtime errors.

The browser fixture implements a deliberately limited DOM/Canvas surface. Its type assertions are confined to crossing that mock boundary; assertions and engine consumers remain checked. Test registrations use void test(...) because Node's runner owns their completion and failure reporting; awaiting registration with this in-process runner can block module loading.

This migration changes authoring/build tooling, not ownership, timing or update order. Runtime validation remains necessary for JavaScript callers and external data. Static checks do not replace browser or workload testing.

Tool references: [TypeScript strict checking](https://www.typescriptlang.org/tsconfig/strict.html), [Prettier CLI checking](https://prettier.io/docs/cli#check).
