# Optional MCP service and quest proof

Status: Rocket's combined authoring host and separate consumer are implemented. Deterministic TCP discovery, immutable publication/replay and both published quest branches pass. This is a working proof slice, not approval for a generation batch or deployment.

## Ownership and use

Import `McpService` from `rocket-engine-v2/mcp`. The engine root remains free of MCP and CFW imports. The optional entry point requires Node and the optional peer `@modelcontextprotocol/sdk` 1.32.1. Domain providers use the structural types in `src/mcp/contracts.ts`; they do not need another server implementation.

```ts
const host = rocket.use(McpService).configure({
  credential,
  allowedHosts: ['127.0.0.1:8093'],
  resolveBinding: (request) => provider.resolveBinding(request),
});
const unregister = host.register(provider);
// Adapt your HTTP listener to Web Request/Response:
const response = await host.handle(request);
```

The application authenticates domain bindings in `resolveBinding`; the host first checks bearer credentials, authority and origin. A binding supplies an opaque scope, explicitly selected provider IDs, optional string metadata and `isCurrent()`. The host preserves the exact binding object as an authority token. CFW chooses provider IDs at trusted bind time and retains its binding/session/generation headers, validation, execution lane and receipts. The engine does not invent actors or domain authorization. Provider `tools(binding)` supplies the actual MCP schemas and `call(name,args,{binding,headers,signal})` supplies the existing result envelope. Call/turn/effect headers reach the provider unchanged. Duplicate tool names across selected providers reject initialization; there is no silent override.

The host owns connections and registration. The application owns simulation and provider disposal. `unregister()` immediately aborts affected connections and is idempotent; it does not dispose the simulation. `stop()` retires current connections. Synchronous `dispose()` permanently rejects requests and aborts connections; `await host.close()` is the explicit transport shutdown barrier after engine disposal. Separately await provider disposal where required. Cancellation prevents accepting a retired response; it does not promise rollback of already applied domain mutations. CFW's existing receipts remain responsible for reconciliation.

There is no new clock. Applications advance domain lanes with their existing fixed tick. Bounds retained: 128 tools per binding, 64 connections by default, 30 minute idle expiry checked on requests, 128 KiB request body, no SSE GET, no catalogue pagination. Limits reject rather than truncate. Providers validate tool arguments and outputs; a low-level SDK Server preserves authored JSON schemas. No new policy framework or general query language is introduced.

## Current authoring endpoint

The combined application exposes 32 tools: 24 installed CFW builder tools and eight game-owned plain-text context/example tools. `game_author_briefing` provides the introduction, vocabulary and native tool descriptions. Entity lookup, navigation, distances and journal/status reads provide focused context. See [GAME-CONTEXT-TOOLS.md](GAME-CONTEXT-TOOLS.md). The obsolete bulk summary provider, its standalone launcher, duplicate game description and old proof script have been removed. Discovery checks reject its reintroduction.

```sh
npm run check
node scripts/context-tools-proof.mjs
node scripts/quest-proof.mjs
ROCKET_MCP_TOKEN=local-proof-only node dist/examples/quest-authoring/combined-server.js
```

The default authoring fixture listens on loopback8095; the configured live demo uses8120. Its token is never printed. Use exact startup binding headers, including the generated binding generation. CAI owns its association/session configuration and binding publication. Rocket supplies the endpoint, providers, game-owned context and separate published-result consumer. `ROCKET_AUTHOR_SESSION_ID`, `ROCKET_AUTHOR_CHARACTER_ID` and `ROCKET_AUTHOR_STORE` select the application-owned session and durable author namespace.

An optional `ROCKET_MCP_PRIVATE_HOST` binds an additional MCP-only listener to a specific private IPv4 interface for local containers. Only that exact authority is added to the allowlist. The HTTP adapter constructs each request URL from its listener interface; mismatching Host headers remain rejected. Browser generation operations remain loopback-only. No public listener or firewall changes are made by the application.

The development dependency `cfw-authoring-candidate` remains the frozen206 archive `vendor/character-framework-authoring-0.1.0-8adb200bdb20.tgz`. The playable/browser `character-framework` pin stays c55c. The combined host derives game capabilities and references from the existing QuestHost and world. CFW owns authoring schemas, validation and immutable publications. Builder operations retain their native result envelopes; context tools return plain text. Authoring never executes gameplay.

## Generation and playback

See [QUEST-GENERATION-DEMO.md](QUEST-GENERATION-DEMO.md). The game supplies the assignment; the player clicks Generate. CAI owns the queue/model, receipts and prompt. The host verifies exact job/call/publication identity and canonical definition digest before offering a separate Load action. No model call occurs during discovery, polling or playback. A finished job alone is not a published or playable quest.

The consumer uses the existing world, capabilities, movement and Panel/ChatBox handlers. Original baseline quest SHA256 remains `32aabc76aaf1c3f0a8cc57bb6a9287ac3f55eb46334c78a3ba6086be8d0c9f9d`; its original browser demo is `character-encounter.html`. Candidate files and receipts remain separate. No candidate-specific rescue behavior is supplied.

## Verification

The context proof exercises actual official SDK HTTP discovery, all17 plain-text examples, strict arguments, no duplicate structured output and lifecycle cleanup. The deterministic builder proof executes the maintained63-call sequence, exact publication/command replay after SQLite reopen and both branches through existing handlers. These are transport/runtime checks, not evidence of model quality. Tests also cover bearer/authority/origin/binding boundaries and private-listener Host validation.

Historical integration logs and exact artifacts remain under `docs/evidence/`; their old tool counts describe those snapshots and are not current launch instructions. No historical evidence or original quest/demo is deleted by removal of obsolete code.
