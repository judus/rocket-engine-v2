import {
  Rocket,
  Scene2D,
  Input,
  SpatialIndex,
  pickTop,
} from '../../src/index.js';
import {
  GridTraversal,
  GridNavigator,
  Movement,
  type Journey,
} from '../../src/navigation/index.js';
import { Panel, ChatBox } from '../../src/ui/index.js';
import { MaraHost } from './MaraHost.js';
import { LocalDeparture } from './LocalDeparture.js';
import { grove, groveBounds, playerJourneyLabel } from './GroveVisit.js';
const output = document.querySelector<HTMLOutputElement>('#character-status')!;
const app = new Rocket({
  fixed: {},
  performance: true,
  onError: (error) => {
    output.textContent = String(error);
  },
});
const domain = { minX: 0, minY: 0, columns: 20, rows: 10, tileSize: 32 };
const wall = {
  id: 'wall',
  bounds: { minX: 288, minY: 64, maxX: 320, maxY: 256 },
};
const traversal = new GridTraversal(
  domain,
  () => ({ status: 'passable', cost: 1 }),
  () => 0,
  () => [wall],
);
const movement = new Movement(
  new GridNavigator(traversal, domain),
  { x: 48, y: 208 },
  { radius: 9, clearance: 2, capabilities: ['walk'] },
);
const npc: LocalDeparture = new LocalDeparture(
  new Movement(
    new GridNavigator(traversal, domain),
    { x: 112, y: 144 },
    { radius: 9, clearance: 2, capabilities: ['walk'] },
  ),
  () => host.sessionId,
  new Map([['grove', grove]]),
);
const visitPolicy =
  new URLSearchParams(location.search).get('visitPolicy') === 'skip-if-visited'
    ? 'skip-if-visited'
    : 'after-acceptance';
const host: MaraHost = new MaraHost(npc, visitPolicy);
const policySelect =
  document.querySelector<HTMLSelectElement>('#visit-policy')!;
policySelect.value = visitPolicy;
document.querySelector('#visit-policy-description')!.textContent =
  visitPolicy === 'after-acceptance'
    ? 'New visit required: accept first, then arrive. If you visited earlier or are already in the grove, leave and return after accepting.'
    : 'Skip prior visits: if you already visited when asking for work, Mara does not offer this quest. If an offer already existed before the visit, that visit can satisfy it on acceptance.';
let journey: Journey | undefined;
let updates = 0;
const index = new SpatialIndex<string>();
index.insert('mara', { minX: 96, minY: 128, maxX: 128, maxY: 160 }, 'mara');
const scene = app.scene(
  new Scene2D({
    update(dt) {
      movement.update(dt);
      npc.update(dt);
      if (!npc.stats.retired)
        index.update('mara', {
          minX: npc.position.x - 16,
          minY: npc.position.y - 16,
          maxX: npc.position.x + 16,
          maxY: npc.position.y + 16,
        });
      host.observePlayer(movement.position, journey?.snapshot());
      host.advance(dt);
      updates++;
      if (!map.disposed && pointer.pointer.pressed && pointer.pointer.world) {
        const point = pointer.pointer.world;
        if (pickTop(index.at(point), point, () => 0)) {
          panels[0]!.show();
          panels[0]!.focus(boxes[0]!.input);
        } else
          journey = movement.move({
            destination: point,
            speed: 120,
            arrivalTolerance: 0.5,
            replan: 'on-change',
          });
      }
      output.textContent = `Quest: ${host.questStatus} · quest visit: ${host.questVisitSatisfied ? 'satisfied' : 'not satisfied'} · lifetime visit: ${host.visited ? 'arrived' : 'not visited'} · journey: ${playerJourneyLabel(journey?.snapshot())} · Mara: ${npc.snapshot()?.status ?? 'idle'} (${npc.stats.starts} journeys, ${npc.stats.terminals} outcomes) · ${updates} shared updates · ${(app.performance?.fps ?? 0).toFixed(0)} FPS`;
    },
    draw(ctx) {
      ctx.fillStyle = '#101d2c';
      ctx.fillRect(0, 0, 640, 320);
      if (ctx.canvas === diagnostic.canvas) {
        ctx.fillStyle = '#80dbbd';
        ctx.font = '18px monospace';
        const lines = [
          'One NPC · one CFW runtime',
          `Quest: ${host.questStatus}`,
          `Lifetime visit: ${host.visited} · quest visit: ${host.questVisitSatisfied}`,
          `Player: ${movement.position.x.toFixed(1)}, ${movement.position.y.toFixed(1)}`,
          `Journey: ${playerJourneyLabel(journey?.snapshot())}`,
          `CFW quests: ${host.narrative.stats.quests}`,
          `Pending commands: ${host.narrative.stats.pendingCommands}`,
          `Mara: ${npc.snapshot()?.status ?? 'idle'} · ${npc.stats.starts} journeys`,
          'Chat views share one host.',
        ];
        lines.forEach((line, i) => ctx.fillText(line, 20, 35 + i * 34));
        return;
      }
      ctx.strokeStyle = '#233b52';
      for (let x = 0; x <= 640; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 320);
        ctx.stroke();
      }
      for (let y = 0; y <= 320; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(640, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#718398';
      ctx.fillRect(288, 64, 32, 192);
      ctx.fillStyle = '#275d42';
      ctx.fillRect(
        groveBounds.minX,
        groveBounds.minY,
        groveBounds.maxX - groveBounds.minX,
        groveBounds.maxY - groveBounds.minY,
      );
      ctx.fillStyle = '#afdb88';
      ctx.font = '14px monospace';
      ctx.fillText('Old Grove', 472, 166);
      if (!npc.stats.retired) {
        ctx.fillStyle = '#f3cd7c';
        ctx.fillRect(npc.position.x - 16, npc.position.y - 16, 32, 32);
        ctx.fillText(
          'Mara · click me',
          npc.position.x - 46,
          npc.position.y - 28,
        );
      }
      const route = journey?.snapshot().route ?? [];
      if (route.length) {
        ctx.strokeStyle = '#80dbbd';
        ctx.beginPath();
        route.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }
      ctx.fillStyle = '#80dbbd';
      ctx.beginPath();
      ctx.arc(movement.position.x, movement.position.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d4dfed';
      ctx.fillText(
        'Player',
        movement.position.x - 20,
        movement.position.y + 26,
      );
    },
  }),
);
scene.own(host);
scene.own(npc);
scene.own(movement);
scene.own(index);
const controls = scene.own(app.use(Input).scope(scene, {}));
const map = app.view({
  target: '#character-world',
  scene,
  width: 640,
  height: 320,
});
map.canvas.setAttribute('aria-label', 'Mara and player map');
const pointer = controls.bind(map);
const diagnostic = app.view({
  target: '#character-diagnostics',
  scene,
  width: 640,
  height: 320,
});
diagnostic.canvas.setAttribute('aria-label', 'Character and quest diagnostics');
const panels = [map, diagnostic].map(
  (view, i) =>
    new Panel({
      target: i === 0 ? '#character-chat' : '#character-chat-two',
      title: i === 0 ? 'Mara' : 'Mara · second presentation',
      view,
    }),
);
const boxes = panels.map((panel) => new ChatBox(panel, host));
panels.forEach((panel) => panel.close());
const events = new AbortController();
scene.own(() => {
  events.abort();
});
policySelect.addEventListener(
  'change',
  () => {
    const url = new URL(location.href);
    url.searchParams.set('visitPolicy', policySelect.value);
    location.href = url.href;
  },
  { signal: events.signal },
);
function button(id: string, action: () => void) {
  document
    .querySelector(id)!
    .addEventListener('click', action, { signal: events.signal });
}
button('#open-mara', () => {
  panels[0]!.show();
  panels[0]!.focus(boxes[0]!.input);
});
button('#open-mara-two', () => {
  panels[1]!.show();
  panels[1]!.focus(boxes[1]!.input);
});
button('#walk-grove', () => {
  journey = movement.move({
    destination: grove,
    speed: 120,
    arrivalTolerance: 0.5,
    replan: 'on-change',
  });
});
button('#return-mara', () => {
  journey = movement.move({
    destination: { x: 144, y: 208 },
    speed: 120,
    arrivalTolerance: 0.5,
    replan: 'on-change',
  });
});
button('#dispose-character-proof', () => {
  void app.dispose().then(() => {
    output.textContent = `Disposed: ${app.disposed} · Mara retired: ${npc.stats.retired} · starts/outcomes: ${npc.stats.starts}/${npc.stats.terminals} · both views disposed: ${map.disposed && diagnostic.disposed}`;
  });
});
button('#cancel-mara-journey', () => {
  npc.cancel();
});
button('#retry-mara-route', () => {
  npc.retryRoute();
});
button('#lose-mara-reply', () => {
  host.loseDepartureReply();
});
button('#remove-mara', () => {
  npc.dispose();
  index.remove('mara');
});
button('#fail-mara', () => {
  host.failNext();
});
button('#close-character-diagnostics', () => {
  diagnostic.dispose();
  document.querySelector<HTMLButtonElement>('#open-mara-two')!.disabled = true;
  document.querySelector<HTMLButtonElement>(
    '#close-character-diagnostics',
  )!.disabled = true;
});
window.addEventListener(
  'pagehide',
  () => {
    void app.dispose();
  },
  { once: true },
);
await app.start();
