import {
  Rocket,
  Scene2D,
  Assets,
  Input,
  SpatialIndex,
  pickTop,
} from '../../src/index.js';
import { GridTraversal } from '../../src/navigation/index.js';
import { Panel } from '../../src/ui/index.js';
import type { SituationDefinition } from 'character-framework';
import { ControlledCharacter } from '../character-control/ControlledCharacter.js';
import { grove, groveBounds } from '../characters/GroveVisit.js';
import { GroveHost } from './GroveHost.js';
const events = new AbortController();
const output = document.querySelector('output')!;
const policy = document.querySelector<HTMLSelectElement>('#policy')!;
let app: Rocket | undefined;
let reset = () => {},
  arm = () => {},
  toggleEvidence = () => {},
  loseReply = () => {},
  remove = () => {},
  openPanel = () => {};
let busy = false,
  released = 0;
async function start(prior: 'fresh' | 'visit' | 'pickup' = 'fresh') {
  if (busy) return;
  busy = true;
  document
    .querySelectorAll<HTMLButtonElement>('main .toolbar button')
    .forEach((b) => {
      b.disabled = true;
    });
  policy.disabled = true;
  try {
    reset();
    await app?.dispose();
    arm = toggleEvidence = loseReply = remove = openPanel = () => {};
    const application = new Rocket({
      fixed: { step: 1 / 60 },
      onError: (e) => {
        output.textContent = String(e);
      },
    });
    app = application;
    const assets = application.use(Assets),
      input = application.use(Input);
    let host: GroveHost, player: ControlledCharacter;
    let pending = false,
      armed = false,
      error = '',
      note = '';
    const index = new SpatialIndex<string>();
    const world = new GridTraversal(
      { minX: 0, minY: 0, columns: 20, rows: 10, tileSize: 32 },
      () => ({ status: 'passable', cost: 1 }),
      () => 0,
    );
    const scene = application.scene(
      new Scene2D({
        async prepare({ signal }) {
          this.own(index);
          const response = await fetch(
            new URL(
              `../../../examples/character-grove/grove-${policy.value}.json`,
              import.meta.url,
            ).href,
            { signal },
          );
          if (!response.ok) throw new Error('Authored grove flow unavailable');
          const definition: unknown = await response.json();
          host = this.own(
            new GroveHost(definition as SituationDefinition, prior),
          );
          const lease = await assets.acquireImage(
            new URL(
              '../../../examples/character-sprites/Female1.png',
              import.meta.url,
            ).href,
            { signal },
          );
          if (signal.aborted) {
            lease.dispose();
            signal.throwIfAborted();
          }
          this.own(() => {
            lease.dispose();
            released++;
            return;
          });
          player = new ControlledCharacter(
            world,
            { x: 336, y: 208 },
            lease.image,
          );
          this.root.add(player.node);
          index.insert(
            'survey-marker',
            {
              minX: grove.x - 14,
              minY: grove.y - 14,
              maxX: grove.x + 14,
              maxY: grove.y + 14,
            },
            'survey-marker',
          );
          arm = () => {
            if (pending || armed) return;
            pending = true;
            error = '';
            policy.disabled = true;
            void host.arm().then(
              () => {
                if (app === application && !application.disposed) {
                  pending = false;
                  armed = true;
                }
              },
              (e) => {
                if (app === application && !application.disposed) {
                  pending = false;
                  error = String(e);
                }
              },
            );
          };
          toggleEvidence = () =>
            host.setEvidenceAvailable(!host.state.evidenceAvailable);
          loseReply = () => {
            host.loseNextRevealReply();
            note =
              'Next reveal acknowledgement will be lost; reconciliation keeps its identity.';
          };
          remove = () => {
            host.removeMarker();
            index.remove('survey-marker');
            note = 'Existing marker removed. CFW cannot create a replacement.';
          };
        },
        fixedUpdate(dt) {
          player.update(
            dt,
            {
              x:
                Number(controls.fixed.down('right')) -
                Number(controls.fixed.down('left')),
              y:
                Number(controls.fixed.down('down')) -
                Number(controls.fixed.down('up')),
            },
            controls.fixed.down('run'),
          );
          host.observePlayer(player.movement.position);
          const point = pointer.fixedPointer.world;
          const clicked =
            !!point &&
            pointer.fixedPointer.pressed &&
            !!pickTop(index.at(point), point, () => 0);
          if (controls.fixed.pressed('pickup') || clicked)
            note = host.pickup()
              ? 'Picked up the existing survey marker.'
              : 'Pickup needs a visible, uncollected marker within 24 pixels.';
          host.advance(dt);
          return;
        },
        draw(ctx) {
          ctx.fillStyle = '#233d35';
          ctx.fillRect(0, 0, 640, 320);
          ctx.fillStyle = '#426843';
          ctx.fillRect(groveBounds.minX, groveBounds.minY, 64, 64);
          ctx.fillStyle = '#f3f4d7';
          ctx.font = '13px monospace';
          ctx.fillText('OLD GROVE', 489, 150);
          if (host.state.visible) {
            ctx.fillStyle = '#ffd15c';
            ctx.beginPath();
            ctx.moveTo(grove.x, grove.y - 10);
            ctx.lineTo(grove.x + 10, grove.y);
            ctx.lineTo(grove.x, grove.y + 10);
            ctx.lineTo(grove.x - 10, grove.y);
            ctx.closePath();
            ctx.fill();
          }
          if (host.state.collected) {
            ctx.fillStyle = '#cbd6bc';
            ctx.fillText('RECOVERED', 488, 260);
          }
        },
      }),
    );
    const controls = scene.own(
      input.scope(scene, {
        up: 'KeyW',
        left: 'KeyA',
        down: 'KeyS',
        right: 'KeyD',
        run: ['ShiftLeft', 'ShiftRight'],
        pickup: 'KeyE',
      }),
    );
    reset = () => controls.reset();
    const view = application.view({
      target: '#grove-world',
      scene,
      width: 640,
      height: 320,
      overlay() {
        const s = host.state,
          v = host.view,
          p = player.movement.position;
        document.querySelector<HTMLButtonElement>('#arm')!.disabled =
          pending || armed;
        document.querySelector('#arm')!.textContent = error
          ? 'Retry arming'
          : 'Arm situation';
        document.querySelector<HTMLButtonElement>('#evidence')!.disabled =
          !s.historyComplete;
        document.querySelector('#evidence')!.textContent = s.evidenceAvailable
          ? 'Make event history unavailable'
          : 'Restore event history';
        output.textContent = `World preset ${prior} · player ${p.x.toFixed(1)}, ${p.y.toFixed(1)}\n${pending ? 'Arming…' : v ? `${v.situationId} · ${v.status}` : error ? 'Arming acknowledgement failed; retry original command' : 'Not armed'} · visited ${s.visited} · inside ${s.inside}\nMarker ${!s.exists ? 'removed' : s.collected ? 'already collected' : s.visible ? 'revealed' : 'hidden'} · reveal executions ${s.revealCalls} · event sequence ${s.sequence}\nSaved cuts ${s.cuts.map((c) => `${c.stream}>${c.after}`).join(', ') || 'none'} · history ${!s.historyComplete ? 'truncated; recreate' : s.evidenceAvailable ? 'available' : 'unavailable'}\n${error || v?.error || note} · released sheets ${released}`;
        prose.textContent = v
          ? (v.dialogue ??
            `Situation ${v.status}: ${v.error ?? 'waiting for committed game evidence.'}`)
          : error
            ? 'The arming acknowledgement failed. Retry the original command.'
            : 'Arm the authored flow; then let actual game evidence advance it.';
      },
    });
    const pointer = controls.bind(view);
    const panel = new Panel({
      target: '#grove-panel',
      title: 'Grove situation · authored CFW state',
      view,
    });
    const prose = document.createElement('p');
    panel.content.append(prose);
    panel.close();
    openPanel = () => {
      reset();
      panel.show();
    };
    await application.start();
  } catch (e) {
    await app?.dispose();
    output.textContent = `Preparation failed: ${String(e)}`;
  } finally {
    busy = false;
    document
      .querySelectorAll<HTMLButtonElement>('main .toolbar button')
      .forEach((b) => {
        b.disabled =
          !!app?.disposed &&
          !['fresh', 'prior-visit', 'prior-pickup'].includes(b.id);
      });
    policy.disabled = !!app?.disposed;
  }
}
function button(id: string, action: () => void) {
  document.querySelector(`#${id}`)!.addEventListener(
    'click',
    () => {
      if (busy) return;
      reset();
      action();
    },
    { signal: events.signal },
  );
}
button('arm', () => arm());
button('evidence', () => toggleEvidence());
button('lose', () => loseReply());
button('remove', () => remove());
button('panel', () => openPanel());
button('fresh', () => {
  void start();
});
button('prior-visit', () => {
  void start('visit');
});
button('prior-pickup', () => {
  void start('pickup');
});
button('dispose', () => {
  void app?.dispose().then(() => {
    arm = toggleEvidence = loseReply = remove = openPanel = () => {};
    output.textContent = `Disposed · released sheets ${released}`;
    document
      .querySelectorAll<HTMLButtonElement>('main .toolbar button')
      .forEach((b) => {
        b.disabled = !['fresh', 'prior-visit', 'prior-pickup'].includes(b.id);
      });
  });
});
policy.addEventListener(
  'change',
  () => {
    void start();
  },
  { signal: events.signal },
);
window.addEventListener(
  'pagehide',
  () => {
    events.abort();
    reset();
    void app?.dispose();
  },
  { once: true },
);
void start();
