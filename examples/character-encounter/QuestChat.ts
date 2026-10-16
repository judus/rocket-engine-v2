import type {
  ChatPort,
  ChatCommand,
  ChatSnapshot,
} from '../../src/ui/index.js';
import type { SituationView } from 'character-framework';
import { QuestHost } from './QuestHost.js';
/** Presentation commands retain original CFW command identity across retry. */
export class QuestChat implements ChatPort {
  readonly host: QuestHost;
  readonly sessionId = 'rocket-watchkeeper-chat';
  #view: SituationView | undefined;
  #pending: string | null = null;
  #inflight = false;
  #disposed = false;
  #revision = 0;
  #listeners = new Set<(snapshot: ChatSnapshot) => void>();
  #failed: {
    id: string;
    message: string;
    retry: () => Promise<unknown>;
  } | null = null;
  #signature = '';
  constructor(
    host: QuestHost,
    readonly speaker = 'Watchkeeper',
  ) {
    this.host = host;
  }
  read(): ChatSnapshot {
    const view = this.#view;
    return Object.freeze<ChatSnapshot>({
      sessionId: this.sessionId,
      revision: this.#revision,
      messages: view?.dialogue
        ? [
            Object.freeze({
              id: `${view.runId}:${view.revision}`,
              speaker: this.speaker,
              kind: 'assistant' as const,
              text: view.dialogue,
            }),
          ]
        : [],
      choices:
        !this.#disposed && !this.#inflight && !this.#failed
          ? (view?.choices.map((c) =>
              Object.freeze({ id: c.id, text: c.label }),
            ) ?? [])
          : [],
      pending: this.#pending
        ? Object.freeze({ requestId: this.#pending })
        : null,
      error: this.#failed
        ? Object.freeze({
            requestId: this.#failed.id,
            message: this.#failed.message,
          })
        : null,
      actions: this.#disposed
        ? []
        : this.#pending
          ? ['cancel']
          : this.#failed
            ? ['retry']
            : this.#inflight
              ? []
              : ['choose'],
      cancelLabel: 'Stop waiting',
      status: this.#disposed
        ? 'Disposed'
        : this.#pending
          ? 'Host command pending…'
          : this.#inflight
            ? 'Stopped waiting; host command is still settling.'
            : this.#failed
              ? 'Host command failed. Retry the original delivery.'
              : view?.status === 'closed'
                ? 'Conversation concluded.'
                : !view?.dialogue
                  ? 'Move close to the guide to interact.'
                  : 'Choose an authored response.',
    });
  }
  subscribe(listener: (snapshot: ChatSnapshot) => void): () => void {
    if (this.#disposed) throw new Error('Chat disposed');
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  dispatch(command: ChatCommand): void {
    if (this.#disposed || command.sessionId !== this.sessionId) return;
    if (command.kind === 'cancel') {
      if (command.pendingRequestId !== this.#pending) return;
      this.#pending = null;
      this.#emit();
      return;
    }
    if (command.kind === 'retry') {
      const failed = this.#failed;
      if (!failed || failed.id !== command.failedRequestId || this.#inflight)
        return;
      this.#command(failed.id, failed.retry);
      return;
    }
    if (
      command.kind !== 'choose' ||
      this.#inflight ||
      this.#failed ||
      !this.#view
    )
      return;
    const view = this.#view;
    if (!view.choices.some((c) => c.id === command.choiceId)) return;
    this.#command(command.requestId, () =>
      this.host.handle.choose(
        view.runId,
        command.choiceId,
        view.revision,
        command.requestId,
      ),
    );
  }
  #command(id: string, operation: () => Promise<unknown>): void {
    this.#pending = id;
    this.#inflight = true;
    this.#failed = null;
    this.#emit();
    void operation().then(
      () => {
        if (this.#disposed) return;
        this.#pending = null;
        this.#inflight = false;
        this.#emit();
      },
      (error) => {
        if (this.#disposed) return;
        const waiting = this.#pending !== null;
        this.#pending = null;
        this.#inflight = false;
        // Stop-waiting detaches pending UI, but a failed host delivery remains retryable.
        this.#failed = {
          id,
          message: `${waiting ? '' : 'Host command failed after stop-waiting: '}${String(error)}`,
          retry: operation,
        };
        this.#emit();
      },
    );
  }
  refresh(): void {
    if (this.#disposed) return;
    this.#view = this.host.view || undefined;
    const signature = JSON.stringify([
      this.#view,
      this.#pending,
      this.#failed?.id,
      this.#inflight,
    ]);
    if (signature !== this.#signature) {
      this.#signature = signature;
      this.#emit();
    }
  }
  #emit(): void {
    this.#revision++;
    const snapshot = this.read();
    this.#listeners.forEach((l) => l(snapshot));
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;

    this.#pending = null;
    this.#failed = null;
    this.#inflight = false;
    this.#emit();
    this.#listeners.clear();
  }
}
