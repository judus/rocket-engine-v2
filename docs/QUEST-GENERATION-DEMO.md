# Quest generation demo

`quest-consumer.html` uses the game-owned assignment for real queued generation, read-only progress, explicit same-request recovery, verified published results and a separate **Load published quest** action. Existing JSON import and the original watchtower demo remain available.

The browser talks only to Rocket's loopback `/demo-api` routes on port 8120. The application bridge uses the installed CFW `CaiHttpBackend` against CAI's normal authenticated session/job/receipt API. The scoped CAI credential stays in a private server-side file. No model call occurs on opening, refreshing, polling or loading a result. **Generate quest** submits a real job. **Stop watching** cancels browser requests and polling, not an already submitted CAI job; the delivered API has no cancellation operation.

## Local configuration

The existing combined server reads `ROCKET_GENERATION_CONNECTION` (default `/tmp/rocket-context-tools-endpoint/generation.json`). This private operator-owned JSON has these fields:

```json
{
  "origin": "http://127.0.0.1:8000",
  "credentialFile": "/private/path/to/scoped-cai-token",
  "sessionId": "12",
  "characterId": "4",
  "model": "actual configured model",
  "limits": "actual configured authoring limits"
}
```

The session must already be provisioned through CAI's operator workflow and bound to the exact current Rocket endpoint headers. `ROCKET_AUTHOR_SESSION_ID` and `ROCKET_AUTHOR_CHARACTER_ID` select those actual IDs in the combined server. Binding publication is operator coordination, not a browser-selected authority. Missing configuration, expired credentials or mismatched bindings disable generation and show the error. The model/limit strings describe CAI's configuration; CAI owns enforcement and model selection.

Request checkpoints live under `ROCKET_GENERATION_CHECKPOINTS` (default `/tmp/rocket-generation-requests`) with private permissions. The exact UUID, brief, admission version and binding generation are written before submission. A lost admission response is recovered by explicitly replaying that same payload. The browser retains only request/job IDs in local storage and resumes on demand after reload. The assignment is captured server-side before dispatch and retained for exact replay. Historical job and publication reads compare the original job generation with the saved admission checkpoint; a later session binding refresh does not invalidate those receipts. Current caller/session authority is still verified, and an uncertain old submission cannot silently be admitted under a new binding. Concurrent admission remains CAI-owned; there is no scheduler or background generation loop.

## Publication and limits

A finished job is not evidence of a published quest. The bridge follows the exact attempt's paginated call receipts, checks successful `publish_quest_draft` outcomes, retains job/call/draft/command/source metadata, loads the exact definition from this host's author namespace and verifies its canonical SHA256 against the returned publication digest. Repeated definition IDs are deduplicated. Unknown publication outcomes or mismatches fail closed. Rejected drafts, failed jobs and reports without publication remain visible; no candidate-specific handlers or fallback quests are supplied.

Loading a verified candidate starts a fresh browser world using the existing handlers. It does not claim every authored branch has been playtested. The authoring context world is initialized from the same scene data but is independent of browser gameplay state. Closing the combined server aborts owned bridge requests; closing the page aborts polling and releases result download URLs. Baseline files remain untouched.

`tests/generation-bridge.test.ts` verifies a lost acknowledgement and exact replay, authority rejection, checkpoint-before-dispatch, job correlation and digest mismatch rejection using controlled HTTP responses. It is not evidence of paid model quality or a live generation run.
