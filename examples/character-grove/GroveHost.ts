import { CharacterRuntime } from 'character-framework';
import type {
  SituationDefinition,
  SituationGame,
  SituationCapability,
  SituationInvocation,
  SituationSave,
  CapabilityResult,
  Invocation,
  Json,
} from 'character-framework';
import type { Point } from '../../src/types.js';
import { insideGrove, grove } from '../characters/GroveVisit.js';
type Prior = 'fresh' | 'visit' | 'pickup';
interface EvidenceEvent {
  readonly sequence: number;
  readonly kind: 'entry' | 'pickup';
  readonly player: string;
  readonly ref: string;
}
interface Cursor {
  readonly world: string;
  readonly after: number;
  readonly stream: string;
}
let worlds = 0;
const record = (v: unknown): v is Record<string, Json> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const complete = (data: Json): CapabilityResult => ({
  status: 'completed',
  data,
});
const unknown = (): CapabilityResult => ({
  status: 'running',
  operationId: 'game-evidence-unavailable',
});
/** Game-owned location/pickup evidence and one preexisting world entity; no inventory subsystem. */
export class GroveHost {
  readonly worldId = `grove-world-${++worlds}`;
  readonly runtime: CharacterRuntime;
  readonly handle;
  #generation = '';
  #revision = 0;
  #sequence = 0;
  #events: EvidenceEvent[] = [];
  #inside = false;
  #visited = false;
  #player: Readonly<Point> = { x: 336, y: 208 };
  #exists = true;
  #visible = false;
  #collected = false;
  #available = true;
  #historyComplete = true;
  #captures = new Map<string, { signature: string; cursor: Cursor }>();
  #cuts = new Map<string, number>();
  #effects = new Map<string, { signature: string; result: CapabilityResult }>();
  #journal: SituationSave | undefined;
  #run: string | undefined;
  #disposed = false;
  #lostReply = false;
  #revealCalls = 0;
  #retired = new Set<string>();
  constructor(
    private readonly definition: SituationDefinition,
    prior: Prior = 'fresh',
  ) {
    if (prior !== 'fresh') {
      this.#visited = true;
      this.#event('entry', 'grove');
    }
    if (prior === 'pickup') {
      this.#collected = true;
      this.#event('pickup', 'survey-marker');
    }
    const schema = (properties: Record<string, Json>) => ({
      type: 'object',
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    });
    const capability = (
      name: string,
      key: string,
      ref: string,
      outputs: Record<string, Json>,
      stream: string,
    ): SituationCapability => ({
      name,
      kind: 'inspection',
      description: 'Game-owned scoped grove evidence.',
      inputSchema: schema({ [key]: { const: ref } }),
      outputSchema: schema(outputs),
      evidenceStream: { ref: stream, captureKeys: [key] },
      validate: (value) =>
        record(value) && Object.keys(value).length === 1 && value[key] === ref,
      execute: (context, args) => this.#inspect(context, name, args),
    });
    const location = capability(
      'rocket_inspect_grove',
      'locationRef',
      'grove',
      {
        inside: { type: 'boolean' },
        visited: { type: 'boolean' },
        entries: { type: 'integer', minimum: 0 },
      },
      'grove-entries',
    );
    const collection = capability(
      'rocket_inspect_marker',
      'existingItemRef',
      'survey-marker',
      {
        collected: { type: 'boolean' },
        count: { type: 'integer', minimum: 0 },
        available: { type: 'boolean' },
      },
      'marker-pickups',
    );
    const reveal: SituationCapability = {
      name: 'rocket_reveal_marker',
      kind: 'action',
      description:
        'Reveal the existing marker; never create or grant another item.',
      inputSchema: schema({ existingItemRef: { const: 'survey-marker' } }),
      outputSchema: schema({
        existingItemRef: { const: 'survey-marker' },
        revealed: { type: 'boolean' },
      }),
      validate: (value) =>
        record(value) &&
        Object.keys(value).length === 1 &&
        value['existingItemRef'] === 'survey-marker',
      execute: (context) => {
        this.#trusted(context);
        const id = context.narrative!.effectId,
          signature = this.#signature(context);
        if (!id) throw new Error('Reveal requires trusted effect identity');
        const priorEffect = this.#effects.get(id);
        if (priorEffect) {
          if (priorEffect.signature !== signature)
            throw new Error('Conflicting reveal identity');
          return priorEffect.result;
        }
        if (!this.#exists)
          return {
            status: 'rejected',
            code: 'marker-removed',
            message:
              'The existing marker was removed; no replacement is created.',
          };
        this.#revealCalls++;
        this.#visible = !this.#collected;
        this.#revision++;
        const result = complete({
          existingItemRef: 'survey-marker',
          revealed: this.#visible,
        });
        this.#effects.set(id, { signature, result });
        if (this.#lostReply) {
          this.#lostReply = false;
          throw new Error('Reveal acknowledgement lost after commit');
        }
        return result;
      },
    };
    const capabilities = [location, collection, reveal];
    const game: SituationGame = {
      capabilities: (character) =>
        character.id === 'grove-director' ? capabilities : [],
      scopeAvailable: (character, scope) =>
        character.id === 'grove-director' &&
        scope.kind === 'player' &&
        scope.ref === 'player',
      capture: (context, stream, args) => {
        this.#trusted(context);
        const cap = capabilities.find((c) => c.evidenceStream?.ref === stream);
        if (!cap || !cap.validate(args))
          throw new Error('Unknown capture scope');
        const id = context.narrative.effectId;
        if (!id) throw new Error('Capture identity required');
        const signature = this.#signature(context) + ':' + stream;
        const previous = this.#captures.get(id);
        if (previous && previous.signature !== signature)
          throw new Error('Conflicting capture identity');
        if (!previous) {
          if (this.#captures.size >= 256)
            throw new Error('Capture ledger full');
          const boundary =
            context.narrative.runId + ':' + context.narrative.entryId;
          if (!this.#cuts.has(boundary))
            this.#cuts.set(boundary, this.#sequence);
          this.#captures.set(id, {
            signature,
            cursor: {
              world: this.worldId,
              after: this.#cuts.get(boundary)!,
              stream,
            },
          });
        }
        // Retain the original cut even when its acknowledgement/history is temporarily unavailable.
        if (!this.#available || !this.#historyComplete)
          throw new Error('Authoritative evidence unavailable');
        return { ...this.#captures.get(id)!.cursor };
      },
      observe: (context, observations) => {
        this.#trusted(context);
        const revision = String(this.#revision);
        const results = observations.map((o) => {
          const cap = capabilities.find(
            (c) => c.name === o.capability.name && c.kind === 'inspection',
          );
          if (!cap || !cap.validate(o.arguments))
            throw new Error('Unknown inspection');
          return this.#inspect(
            {
              ...context,
              narrative: {
                ...context.narrative,
                ...(o.evidence ? { evidence: o.evidence } : {}),
              },
            },
            cap.name,
            o.arguments,
          );
        });
        return { revision, results };
      },
      observationCurrent: (context, revision) => {
        this.#trusted(context);
        return revision === String(this.#revision);
      },
      reconcile: (context, cap) => {
        this.#trusted(context);
        if (cap.name !== reveal.name) throw new Error('Unknown action');
        const id = context.narrative.effectId;
        if (!id) throw new Error('Effect identity required');
        const effect = this.#effects.get(id);
        if (!effect) return { status: 'not_admitted' };
        if (effect.signature !== this.#signature(context))
          return {
            status: 'rejected',
            code: 'effect-conflict',
            message: 'Conflicting effect provenance',
          };
        return structuredClone(effect.result);
      },
      persist: (save) => {
        this.#live();
        this.#journal = structuredClone(save);
      },
      retire: (context) => {
        this.#trusted(context);
        this.#retired.add(context.narrative.runId);
      },
    };
    this.runtime = new CharacterRuntime({
      gameId: 'rocket-grove-proof',
      capabilities,
      situationGame: game,
    });
    const director = this.runtime.register({
      id: 'grove-director',
      name: 'Grove director',
      capabilities: capabilities.map((c) => c.name),
    });
    this.#generation = director.snapshot().binding.generation;
    this.handle = this.runtime.situations!.bind(director);
  }
  #signature(context: Invocation): string {
    return JSON.stringify(context.narrative);
  }
  #trusted(context: Invocation): asserts context is SituationInvocation {
    this.#live();
    if (
      context.signal.aborted ||
      context.gameId !== 'rocket-grove-proof' ||
      context.character.id !== 'grove-director' ||
      context.character.binding?.generation !== this.#generation ||
      !context.narrative ||
      context.narrative.scope.kind !== 'player' ||
      context.narrative.scope.ref !== 'player'
    )
      throw new Error('Untrusted grove context');
  }
  #inspect(context: Invocation, name: string, args: Json): CapabilityResult {
    this.#trusted(context);
    const location = name === 'rocket_inspect_grove';
    if (
      !record(args) ||
      Object.keys(args).length !== 1 ||
      args[location ? 'locationRef' : 'existingItemRef'] !==
        (location ? 'grove' : 'survey-marker')
    )
      throw new Error('Invalid evidence arguments');
    const evidence = context.narrative.evidence;
    let count = 0;
    if (evidence) {
      const cursor = evidence.cursor,
        stream = location ? 'grove-entries' : 'marker-pickups';
      if (!this.#available || !this.#historyComplete) return unknown();
      if (
        evidence.streamRef !== stream ||
        !record(cursor) ||
        cursor['world'] !== this.worldId ||
        cursor['stream'] !== stream ||
        typeof cursor['after'] !== 'number' ||
        !Number.isSafeInteger(cursor['after']) ||
        cursor['after'] < 0 ||
        cursor['after'] > this.#sequence ||
        evidence.arguments[location ? 'locationRef' : 'existingItemRef'] !==
          (location ? 'grove' : 'survey-marker')
      )
        return unknown();
      count = this.#events.filter(
        (e) =>
          e.sequence > (cursor['after'] as number) &&
          e.kind === (location ? 'entry' : 'pickup') &&
          e.player === 'player' &&
          e.ref === (location ? 'grove' : 'survey-marker'),
      ).length;
    }
    return location
      ? complete({
          inside: this.#inside,
          visited: this.#visited,
          entries: count,
        })
      : complete({
          collected: this.#collected,
          count,
          available: this.#exists && !this.#collected,
        });
  }
  #event(kind: EvidenceEvent['kind'], ref: string): void {
    this.#sequence++;
    if (this.#events.length < 512)
      this.#events.push({
        sequence: this.#sequence,
        kind,
        player: 'player',
        ref,
      });
    else this.#historyComplete = false;
  }
  observePlayer(position: Readonly<Point>): void {
    this.#live();
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
      throw new Error('Invalid player pose');
    const inside = insideGrove(position);
    this.#player = { ...position };
    if (inside !== this.#inside) {
      this.#inside = inside;
      this.#revision++;
      if (inside) {
        this.#visited = true;
        this.#event('entry', 'grove');
      }
    }
  }
  pickup(): boolean {
    this.#live();
    if (
      !this.#exists ||
      !this.#visible ||
      this.#collected ||
      Math.hypot(this.#player.x - grove.x, this.#player.y - grove.y) > 24
    )
      return false;
    this.#collected = true;
    this.#visible = false;
    this.#event('pickup', 'survey-marker');
    this.#revision++;
    return true;
  }
  removeMarker(): void {
    this.#live();
    this.#exists = false;
    this.#visible = false;
    this.#revision++;
  }
  setEvidenceAvailable(available: boolean): void {
    this.#live();
    this.#available = available;
    this.#revision++;
  }
  loseNextRevealReply(): void {
    this.#live();
    this.#lostReply = true;
  }
  async arm() {
    this.#live();
    await this.handle.publish(this.definition, 'publish-grove');
    const view = await this.handle.start(
      this.definition.id,
      { kind: 'player', ref: 'player' },
      'arm-grove',
    );
    this.#run = view.runId;
    return view;
  }
  get view() {
    return this.#run && !this.#disposed ? this.handle.read(this.#run) : null;
  }
  get state() {
    return Object.freeze({
      inside: this.#inside,
      visited: this.#visited,
      exists: this.#exists,
      visible: this.#visible,
      collected: this.#collected,
      evidenceAvailable: this.#available,
      historyComplete: this.#historyComplete,
      revealCalls: this.#revealCalls,
      sequence: this.#sequence,
      cuts: Object.freeze(
        [...this.#captures.values()].map((c) => Object.freeze({ ...c.cursor })),
      ),
      retired: this.#retired.size,
      journal: !!this.#journal,
    });
  }
  advance(dt: number): void {
    this.#live();
    this.runtime.advance(dt);
  }
  async retire(): Promise<void> {
    if (this.#run) await this.handle.retire(this.#run, 'retire-grove');
  }
  #live(): void {
    if (this.#disposed) throw new Error('Grove host disposed');
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.runtime.dispose();
    return;
  }
}
