interface Job {
  id: string;
  status: 'queued' | 'running' | 'finished' | 'failed';
  report: string | null;
  failureCode: string | null;
}
interface Publication {
  definition: unknown;
  receipt: unknown;
  jobId: string;
  callId: string;
}
interface SavedRequest {
  requestId: string;
  jobId?: string;
}
const storageKey = 'rocket-village-quest-generation-request';
/** Browser presentation only; the local bridge owns credentials and receipt verification. */
export function generationPanel(
  load: (definition: unknown, name: string) => Promise<void>,
) {
  const element = <T extends HTMLElement>(id: string) =>
    document.querySelector<T>('#' + id)!;
  const generate = element<HTMLButtonElement>('generate');
  const retry = element<HTMLButtonElement>('generation-retry');
  const stop = element<HTMLButtonElement>('generation-stop');
  const release = element<HTMLButtonElement>('generation-release');
  const refresh = element<HTMLButtonElement>('generation-connect');
  const status = element<HTMLOutputElement>('generation-status');
  const results = element<HTMLDivElement>('generation-results');
  const lifetime = new AbortController();
  let watching: AbortController | undefined;
  let saved: SavedRequest | undefined;
  let ready = false;
  let active = false;
  async function api(path: string, signal: AbortSignal, input?: unknown) {
    const response = await fetch('http://127.0.0.1:8120/demo-api/' + path, {
      signal,
      ...(input === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          }),
    });
    const value = (await response.json()) as {
      error?: string;
      job?: Job;
      publications?: Publication[];
      model?: string;
      limits?: string;
    };
    if (!response.ok)
      throw new Error(
        value.error ?? `Generation request failed (${response.status}).`,
      );
    return value;
  }
  function controls() {
    generate.disabled = !ready || active || !!saved;
    retry.disabled = active || !saved;
    stop.disabled = !active;
    release.disabled = active || !saved;
    refresh.disabled = active;
  }
  function persist() {
    if (saved) localStorage.setItem(storageKey, JSON.stringify(saved));
    else localStorage.removeItem(storageKey);
  }
  async function connect() {
    try {
      const config = await api(
        'config',
        AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)]),
      );
      ready = true;
      element('generation-settings').textContent =
        `Model: ${config.model} · ${config.limits}`;
      status.textContent = saved
        ? 'A previous request is retained. Resume to recover its status.'
        : 'Ready. Generate submits one real model job using the saved CAI configuration.';
    } catch (error) {
      ready = false;
      element('generation-settings').textContent =
        'Generation connection unavailable.';
      status.textContent = String(error);
    }
    controls();
  }
  async function watch() {
    if (!saved || active) return;
    active = true;
    results.replaceChildren();
    watching = new AbortController();
    const signal = AbortSignal.any([watching.signal, lifetime.signal]);
    controls();
    try {
      const request = saved;
      if (!request.jobId) {
        status.textContent = 'Submitting…';
        const admission = await api('jobs', signal, {
          requestId: request.requestId,
        });
        if (!admission.job) throw new Error('Missing admission receipt.');
        request.jobId = admission.job.id;
        persist();
      }
      const path = `jobs/${request.requestId}/${request.jobId}`;
      for (;;) {
        const value = await api(path, signal);
        const job = value.job;
        if (!job) throw new Error('Missing job status.');
        status.textContent = `${job.status} · ${job.id}${job.failureCode ? '\n' + job.failureCode : ''}${job.report ? '\n' + job.report : ''}`;
        if (job.status === 'finished' || job.status === 'failed') {
          const outcome = await api(path + '/publications', signal);
          for (const publication of outcome.publications ?? []) {
            const button = document.createElement('button');
            button.textContent = 'Load published quest';
            button.addEventListener(
              'click',
              () => {
                void load(
                  publication.definition,
                  `Generated quest · ${publication.jobId}`,
                ).catch((error: unknown) => {
                  status.textContent = String(error);
                });
              },
              { signal: lifetime.signal },
            );
            const download = document.createElement('a');
            const blob = URL.createObjectURL(
              new Blob([JSON.stringify(publication, null, 2)], {
                type: 'application/json',
              }),
            );
            download.href = blob;
            download.download = `quest-publication-${publication.callId}.json`;
            download.textContent = 'Download quest and publication receipt';
            lifetime.signal.addEventListener(
              'abort',
              () => URL.revokeObjectURL(blob),
              { once: true },
            );
            results.append(
              button,
              document.createTextNode(' '),
              download,
              document.createElement('br'),
            );
          }
          if (!outcome.publications?.length)
            status.textContent +=
              '\nNo verified publication was returned. The report alone is not a playable quest.';
          const next = document.createElement('button');
          next.textContent = 'New request';
          next.addEventListener(
            'click',
            () => {
              saved = undefined;
              persist();
              results.replaceChildren();
              controls();
            },
            { signal: lifetime.signal },
          );
          results.append(next);
          return;
        }
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(
              new Error(
                'Stopped watching; the server job may still be running. Resume uses the same request.',
              ),
            );
          };
          const timer = setTimeout(() => {
            signal.removeEventListener('abort', abort);
            resolve();
          }, 2000);
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        });
      }
    } catch (error) {
      status.textContent = `${String(error)}\nRequest retained. Resume retries the same submission or reads the same job; it does not create another request.`;
    } finally {
      active = false;
      controls();
    }
  }
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(storageKey) ?? 'null',
    );
    if (
      value &&
      typeof value === 'object' &&
      'requestId' in value &&
      typeof value.requestId === 'string'
    ) {
      saved = value as SavedRequest;
    }
  } catch {
    status.textContent = 'Previous browser checkpoint could not be read.';
  }
  generate.addEventListener(
    'click',
    () => {
      if (active || saved || !ready) return;
      saved = { requestId: crypto.randomUUID() };
      persist();
      void watch();
    },
    { signal: lifetime.signal },
  );
  retry.addEventListener(
    'click',
    () => {
      void watch();
    },
    { signal: lifetime.signal },
  );
  release.addEventListener(
    'click',
    () => {
      if (active || !saved) return;
      saved = undefined;
      persist();
      results.replaceChildren();
      status.textContent =
        'Request released from this demo. This does not cancel the server job.';
      controls();
    },
    { signal: lifetime.signal },
  );
  stop.addEventListener('click', () => watching?.abort(), {
    signal: lifetime.signal,
  });
  refresh.addEventListener(
    'click',
    () => {
      void connect();
    },
    { signal: lifetime.signal },
  );
  window.addEventListener(
    'pagehide',
    () => {
      lifetime.abort();
      watching?.abort();
    },
    { once: true },
  );
  void connect();
}
