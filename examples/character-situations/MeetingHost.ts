import { CharacterRuntime } from 'character-framework';
import type {
  SituationDefinition,
  SituationGame,
  SituationSave,
  SituationView,
  SituationInvocation,
  Json,
} from 'character-framework';
/** Rocket host: game-owned interaction facts, no inventory/action grants. */
export class MeetingHost {
  readonly runtime: CharacterRuntime;
  readonly handle;
  #inside = false;
  #revision = 0;
  #journal: SituationSave | undefined;
  #failPersist = false;
  #disposed = false;
  #holdNext = false;
  #releaseJournal: (() => void) | undefined;
  retired = 0;
  constructor(private readonly definition: SituationDefinition) {
    const trusted = (context: SituationInvocation) =>
      context.gameId === 'rocket-guide-proof' &&
      context.character.id === 'guide' &&
      context.narrative.scope.kind === 'player' &&
      context.narrative.scope.ref === 'player';
    const capability = {
      name: 'rocket_interaction',
      kind: 'inspection' as const,
      description: 'Game-owned player proximity to the guide.',
      inputSchema: {
        type: 'object',
        properties: { npcRef: { const: 'guide' } },
        required: ['npcRef'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: { allowed: { type: 'boolean' } },
        required: ['allowed'],
        additionalProperties: false,
      },
      validate: (input: Json) =>
        !!input &&
        typeof input === 'object' &&
        !Array.isArray(input) &&
        Object.keys(input).length === 1 &&
        input['npcRef'] === 'guide',
      execute: () => ({
        status: 'completed' as const,
        data: { allowed: this.#inside },
      }),
    };
    const game: SituationGame = {
      capabilities: (character) =>
        character.id === 'guide' ? [capability] : [],
      scopeAvailable: (character, scope) =>
        character.id === 'guide' &&
        scope.kind === 'player' &&
        scope.ref === 'player',
      capture: () => {
        throw new Error('This fact-only demo grants no event streams');
      },
      observe: (context, observations) => {
        if (!trusted(context)) throw new Error('Untrusted interaction scope');
        return {
          revision: String(this.#revision),
          results: observations.map((o) => {
            if (
              o.capability.name !== capability.name ||
              !capability.validate(o.arguments)
            )
              throw new Error('Unknown inspection');
            return capability.execute();
          }),
        };
      },
      observationCurrent: (context, revision) =>
        trusted(context) && revision === String(this.#revision),
      reconcile: () => {
        throw new Error('This dialogue demo grants no game actions');
      },
      persist: async (save) => {
        if (this.#holdNext) {
          this.#holdNext = false;
          await new Promise<void>((resolve) => {
            this.#releaseJournal = resolve;
          });
          this.#releaseJournal = undefined;
        }
        if (this.#disposed) throw new Error('Host disposed during persistence');
        if (this.#failPersist) {
          this.#failPersist = false;
          throw new Error('Injected host journal failure');
        }
        this.#journal = structuredClone(save); // Volatile host journal; no crash durability claim.
      },
      retire: (context) => {
        if (!trusted(context)) throw new Error('Untrusted retirement');
        this.retired++;
      },
    };
    this.runtime = new CharacterRuntime({
      gameId: 'rocket-guide-proof',
      capabilities: [capability],
      situationGame: game,
    });
    const guide = this.runtime.register({
      id: 'guide',
      name: 'Guide',
      entityId: 'guide-body',
      capabilities: [capability.name],
    });
    this.handle = this.runtime.situations!.bind(guide);
  }
  setInteraction(allowed: boolean): void {
    if (allowed !== this.#inside) {
      this.#inside = allowed;
      this.#revision++;
    }
  }
  get journalHeld(): boolean {
    return !!this.#releaseJournal;
  }
  holdNextJournal(): void {
    this.#holdNext = true;
  }
  releaseJournal(): void {
    this.#releaseJournal?.();
  }
  failNextJournal(): void {
    this.#failPersist = true;
  }
  get journal(): SituationSave | undefined {
    return this.#journal && structuredClone(this.#journal);
  }
  async start(): Promise<SituationView> {
    await this.handle.publish(this.definition, 'publish-guide-meeting');
    return this.handle.start(
      this.definition.id,
      { kind: 'player', ref: 'player' },
      'start-guide-meeting',
    );
  }
  advance(dt: number): void {
    if (!this.#disposed) this.runtime.advance(dt);
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.releaseJournal();
    this.runtime.dispose();
  }
}
