import type {
  CharacterHostPort,
  HostCommand,
  HostSnapshot,
} from 'character-framework/host';
import type {
  ChatPort,
  ChatCommand,
  ChatSnapshot,
  ChatAction,
} from '../../src/ui/index.js';
/** Presentation-only binding. The caller owns CFW authority and its lifetime. */
export class HostChatPort implements ChatPort {
  #listeners = new Set<(state: ChatSnapshot) => void>();
  #unsubscribe: () => void;
  #revision = 0;
  #epoch = 0;
  #deliveries = new Map<string, { revision: number; admitted: boolean }>();
  #disposed = false;
  #state: HostSnapshot;
  #error: ChatSnapshot['error'] = null;
  #note: string | undefined;
  constructor(
    private host: Pick<CharacterHostPort, 'read' | 'subscribe' | 'dispatch'>,
    private characterName: string,
  ) {
    this.#state = host.read();
    this.#unsubscribe = host.subscribe((state) => {
      this.#state = state;
      if (state.operationId) {
        const delivery = this.#deliveries.get(state.operationId);
        if (delivery) delivery.admitted = true;
      }
      this.#publish();
    });
  }
  get sessionId() {
    return this.#state.sessionId;
  }
  read(): ChatSnapshot {
    const state = this.#state;
    const live = !this.#disposed && state.state !== 'disposed';
    const pending =
      live && state.state === 'pending' && state.operationId
        ? Object.freeze({ requestId: state.operationId })
        : null;
    const names = {
      dialogue: 'send',
      choice: 'choose',
      retry: 'retry',
      replay: 'retry',
      stop_waiting: 'cancel',
    } as const;
    const actions: ChatAction['kind'][] = live
      ? state.commands.map((command) => names[command])
      : [];
    return Object.freeze({
      sessionId: state.sessionId,
      revision: this.#revision,
      messages: Object.freeze(
        state.messages.map((message) =>
          Object.freeze({
            id: message.id,
            speaker: message.speaker === 'player' ? 'You' : this.characterName,
            kind:
              message.speaker === 'player'
                ? ('user' as const)
                : ('assistant' as const),
            text: message.text,
          }),
        ),
      ),
      choices: Object.freeze(
        live
          ? state.choices.map((choice) =>
              Object.freeze({ id: choice.id, text: choice.label }),
            )
          : [],
      ),
      pending,
      error:
        this.#error ??
        (live && state.state === 'uncertain' && state.operationId
          ? Object.freeze({
              requestId: state.operationId,
              message:
                'Host outcome is uncertain. Retry the original operation.',
            })
          : null),
      actions: Object.freeze(actions),
      cancelLabel: 'Stop waiting',
      status:
        this.#note ??
        (state.authorityPending
          ? 'Host is publishing committed quest updates…'
          : pending
            ? 'Host reply pending… Stop waiting preserves host work.'
            : 'Enter sends · Shift+Enter adds a line'),
    });
  }
  subscribe(listener: (state: ChatSnapshot) => void): () => void {
    if (this.#disposed) throw new Error('Chat adapter disposed');
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  notice(text: string): void {
    if (this.#disposed) return;
    this.#note = text;
    this.#publish();
  }
  dispatch(command: ChatCommand): void {
    if (this.#disposed || command.sessionId !== this.sessionId) return;
    const current = this.#state;
    const newIntent = command.kind === 'send' || command.kind === 'choose';
    const prior = this.#deliveries.get(command.requestId);
    if (newIntent && !prior) {
      if (this.#deliveries.size >= 128)
        throw new Error('Chat delivery ledger saturated');
      this.#deliveries.set(command.requestId, {
        revision: current.revision,
        admitted: false,
      });
    }
    const revision = prior?.revision ?? current.revision;
    let mapped: HostCommand;
    if (command.kind === 'send')
      mapped = {
        kind: 'dialogue',
        requestId: command.requestId,
        expectedRevision: revision,
        message: command.text,
      };
    else if (command.kind === 'choose')
      mapped = {
        kind: 'choice',
        requestId: command.requestId,
        expectedRevision: revision,
        choiceId: command.choiceId,
      };
    else if (command.kind === 'retry') {
      if (current.commands.includes('replay')) {
        if (command.failedRequestId !== current.operationId)
          throw new Error('Unknown replay operation');
        mapped = { kind: 'replay', operationId: command.failedRequestId };
      } else
        mapped = {
          kind: 'retry',
          requestId: command.requestId,
          failedRequestId: command.failedRequestId,
        };
    } else
      mapped = {
        kind: 'stop_waiting',
        requestId: command.requestId,
        pendingRequestId: command.pendingRequestId,
      };
    const epoch = command.kind === 'cancel' ? this.#epoch : ++this.#epoch;
    if (command.kind !== 'cancel') {
      this.#error = null;
      this.#note = undefined;
    }
    void this.host.dispatch(mapped).then(
      () => {
        if (this.#disposed || epoch !== this.#epoch) return;
        this.#error = null;
        if (command.kind === 'cancel')
          this.#note =
            'Host work continues. You can close this panel to stop waiting; committed effects are preserved.';
        else this.#note = undefined;
        this.#state = this.host.read();
        this.#publish();
      },
      (error: unknown) => {
        if (this.#disposed || epoch !== this.#epoch) return;
        this.#state = this.host.read();
        if (newIntent && !this.#deliveries.get(command.requestId)?.admitted)
          this.#deliveries.delete(command.requestId);
        this.#error = Object.freeze({
          requestId: this.#state.operationId ?? command.requestId,
          message: error instanceof Error ? error.message : String(error),
        });
        this.#publish();
      },
    );
  }
  #publish(): void {
    if (this.#disposed) return;
    this.#revision++;
    const state = this.read();
    for (const listener of this.#listeners) {
      try {
        listener(state);
      } catch {
        /* A view cannot interrupt host settlement. */
      }
    }
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#epoch++;
    this.#unsubscribe();
    this.#listeners.clear();
  }
}
