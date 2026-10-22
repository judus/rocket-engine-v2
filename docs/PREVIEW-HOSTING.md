# Provisional preview hosting

One checkout and build, two static site entry points; no source rearrangement.

- `rocket.maduser.net/`: existing root index and engine-demo navigation.
- `farwake.maduser.net/`: redirect to `/games/farwake/`, the current game entry point.
  Keep that path: its relative stylesheet, import-map and module URLs already work.
- Both hosts can serve the same built static artifact. No SPA fallback is needed;
  ordinary files and directory index.html routes are used.

Build with Node 24, `npm ci` then `npm run build`. `dist/` alone is insufficient:
HTML entry points, CSS and assets also live in root, examples/, games/, apps/ and
src/. Serve compiled dist/vendor/ browser modules, not the npm node_modules tree.
Do not publish .git, .env, node_modules or local credentials/configuration.

The complete gate is `npm run check`: typechecking, lint, formatting, build,
tests and coverage. Local verification passes all 835 tests. Four stale rotation
assertions were updated to match the already accepted handling; no flight tuning
was changed. HTTP listener tests require a host that permits local listeners.

The **Review · prototypes & tools** menu groups remaining cockpit fitting,
Flight Foundry and local quest-authoring pages. The surface benchmark and asteroid
asset inspection remain accessible by URL; redundant cockpit integration HTML
pages were retired in favor of neutral renderer demos. Unlisting provides no
access control.

Farwake and ordinary engine demos need no backend API, secrets, database or
server-side persistent storage. Browser settings/save examples use client-side
storage. Quest generation is a separate local API demonstration; it is labelled
as such in the review section and has no hosted API deployment in this scope.
Native worker examples do not require SharedArrayBuffer or cross-origin
isolation headers. Serve JavaScript modules with a JavaScript MIME type and
videos as video/mp4 with range-request support. HTTPS is the public entry point.
Avoid long immutable caching for the unversioned HTML/JS/assets; previews must
revalidate after a deployment. No CSP policy has been added in this cleanup.

## GitHub workflow

Work on `dev` and open PRs into `main`. The workflow checks dev pushes and main
PRs. Only a merged PR triggers packaging and deployment; direct pushes to main
do not deploy. Main should require a PR and the **Quality gate** check.

`npm run package:preview` requires a clean committed checkout, builds browser
modules, then copies an explicit browser-file allowlist to `build/preview/site/`.
The archive is `rocket-preview-<full commit SHA>.tar.gz`, with the publish tree
at its root and a root `release.json` containing revision and file checksums.
Archive ordering, timestamps, ownership and permissions are normalized so retries
of the same revision produce the same archive checksum.
It excludes repository metadata, node_modules, TypeScript and source maps.
Concrete local HTML references are checked before packaging. Runtime-created
asset URLs still need browser verification. Matter.js is copied into the
versioned dist/vendor tree during build, alongside the other browser packages.

One runner job checks the exact merged revision, packages it and conditionally
activates it. The archive stays on that runner and is streamed directly to the
server, which retains releases; GitHub artifact storage is not required.
Merged-release jobs are serialized without cancelling active work; superseded
revisions are skipped. PR and dev checks use independent concurrency groups.
The deployment client verifies the local archive checksum, uses a pinned SSH
host key, streams the archive, then requests activation.

Required repository secrets, provisioned with Netzy:

- `DEPLOY_HOST`: deployment hostname.
- `DEPLOY_SSH_KEY`: dedicated key restricted by the server dispatcher.
- `DEPLOY_KNOWN_HOSTS`: trusted pinned SSH host key.

The client connects as maduser on port 22 and invokes only
`upload <revision> <archive SHA-256>` followed by
`deploy <revision> <archive SHA-256>`. No credentials belong in the artifact.

Netzy owns the restricted dispatcher, server validation, backup before activation,
HTTPS, nginx/Compose/Traefik, atomic release activation and rollback. Releases
live under `/srv/maduser/projects/rocket-previews/releases/<revision>/`, with
uploads under `/srv/maduser/incoming/rocket-previews/`.

Local CI/client tests and workflow validation do not prove a live deployment.
The repository, main branch protections and server provisioning are installed.
Verify the Actions result and public release revision for each deployment.
