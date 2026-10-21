# Provisional preview hosting

One checkout and build, two static site entry points; no source rearrangement.

- `rocket.maduser.net/`: existing root index and engine-demo navigation.
- `farwake.maduser.net/`: redirect to `/games/ship/`, the current game entry point.
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

The temporary **Review · prototypes & tools** menu section groups cockpit
integration/fitting pages, Flight Foundry, surface benchmarks, asteroid asset
inspection and the local quest-authoring consumer. Julien will inspect them
before deciding what should disappear from navigation. Unlisting does not remove
files or provide access control.

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
It excludes repository metadata, node_modules, TypeScript and source maps.
Concrete local HTML references are checked before packaging. Runtime-created
asset URLs still need browser verification. Matter.js is copied into the
versioned dist/vendor tree during build, alongside the other browser packages.

The checked merged revision and archive SHA-256 pass between CI jobs. Deployment
is serialized without cancelling an active activation; superseded revisions are
skipped. The deployment client verifies the downloaded archive checksum, uses a
pinned SSH host key, streams the archive, then requests activation.

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
GitHub publication, branch rules and server secret provisioning must be verified
when the repository destination is selected.
