import { Decorations, decorationAt, type Decoration } from './Decorations.js';
import { TileFriendlyTerrain } from './TileFriendlyTerrain.js';
import {
  Assets,
  Input,
  Rocket,
  Scene2D,
  type ImageLease,
} from '../../src/index.js';
import { paintLegacyTile } from './LegacyTilePainter.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import {
  compareDepth,
  higherMask,
  resolveFrames,
  type DepthItem,
} from './Autotile.js';
import { type Rect } from './LegacyAtlas.js';
function element<T extends Element>(id: string, kind: { new (): T }): T {
  const el = document.querySelector(id);
  if (!(el instanceof kind)) throw new Error(`Missing ${id}`);
  return el;
}
const status = element('#legacy-status', HTMLOutputElement),
  meter = element('#legacy-meter', HTMLOutputElement),
  debug = element('#legacy-debug', HTMLInputElement),
  friendly = element('#legacy-friendly', HTMLInputElement);
const generator = new TerrainGenerator({ seed: 42, scale: 48 });
const tile = 16,
  chunk = 16,
  viewportWidth = 640,
  viewportHeight = 480;
const rawTier = (x: number, y: number) =>
  Math.max(0, Math.min(11, Math.floor(generator.sample(x, y).height * 16) - 3));
const shaped = new TileFriendlyTerrain(rawTier);
const read = (x: number, y: number) =>
  friendly.checked ? shaped.read(x, y) : rawTier(x, y);
const decorationCache = new Decorations(
  (x, y) => ({ tier: read(x, y), height: generator.sample(x, y).height }),
  generator.config.seed,
);
function treeAt(x: number, y: number): Decoration | null {
  const record = decorationAt(
    generator.config.seed,
    x,
    y,
    read(x, y),
    generator.sample(x, y).height,
    higherMask(x, y, read),
  );
  return record?.sprite.kind === 'tree' ? record : null;
}
let anchor: Decoration | null = null;
for (let y = -24; y < 24 && !anchor; y++)
  for (let x = -24; x < 24 && !anchor; x++) anchor = treeAt(x, y);
if (!anchor) throw new Error('Seed has no demonstration tree');
const treeAnchor = anchor;
const walker = { id: 'walker', x: treeAnchor.x, feetY: treeAnchor.feetY - 32 };
const regions = new Map<
  string,
  { canvas: HTMLCanvasElement; x: number; y: number }
>();
let terrainImage: ImageLease | undefined,
  vegetationImage: ImageLease | undefined;
let builds = 0,
  rebuildMs = 0,
  mask = 0,
  drawList: DepthItem[] = [];
const app = new Rocket({
  performance: true,
  onError(error) {
    status.textContent = String(error);
  },
});
const assets = app.use(Assets);
function sprite(
  ctx: CanvasRenderingContext2D,
  image: ImageBitmap,
  rect: Rect,
  x: number,
  y: number,
) {
  ctx.drawImage(image, ...rect, x, y, rect[2], rect[3]);
}
function groundTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  py: number,
  forcedMask?: number,
  forcedLevel?: number,
) {
  if (!terrainImage) return;
  paintLegacyTile(
    ctx,
    terrainImage.image,
    forcedLevel ?? read(x, y),
    forcedMask ?? higherMask(x, y, read),
    px,
    py,
  );
}
function retainGround() {
  const started = performance.now(),
    keep = new Set<string>();
  const minX = Math.floor(worldView.camera.x / (chunk * tile)),
    minY = Math.floor(worldView.camera.y / (chunk * tile));
  const maxX = Math.ceil((worldView.camera.x + viewportWidth) / (chunk * tile)),
    maxY = Math.ceil((worldView.camera.y + viewportHeight) / (chunk * tile));
  let changed = false;
  for (let cy = minY; cy < maxY; cy++)
    for (let cx = minX; cx < maxX; cx++) {
      const key = `${cx},${cy}`;
      keep.add(key);
      if (regions.has(key)) continue;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = chunk * tile;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      for (let y = 0; y < chunk; y++)
        for (let x = 0; x < chunk; x++)
          groundTile(ctx, cx * chunk + x, cy * chunk + y, x * tile, y * tile);
      for (const record of decorationCache.region(cx, cy)) {
        if (record.sprite.layer === 'ground' && terrainImage && vegetationImage)
          sprite(
            ctx,
            record.sprite.sheet === 'terrain'
              ? terrainImage.image
              : vegetationImage.image,
            record.sprite.rect,
            record.x - cx * chunk * tile - record.sprite.rect[2] / 2,
            record.feetY - cy * chunk * tile - record.sprite.rect[3],
          );
      }
      regions.set(key, { canvas, x: cx * chunk * tile, y: cy * chunk * tile });
      builds++;
      changed = true;
    }
  for (const [key, region] of regions)
    if (!keep.has(key)) {
      region.canvas.width = 0;
      regions.delete(key);
    }
  if (changed) rebuildMs = performance.now() - started;
}
function retainDecorations() {
  decorationCache.retain({
    minX: Math.floor((worldView.camera.x - 40) / tile),
    minY: Math.floor(worldView.camera.y / tile),
    maxX: Math.ceil((worldView.camera.x + viewportWidth + 40) / tile),
    maxY: Math.ceil((worldView.camera.y + viewportHeight + 112) / tile),
  });
}
function visibleDecorations() {
  return decorationCache.visible({
    minX: worldView.camera.x,
    minY: worldView.camera.y,
    maxX: worldView.camera.x + viewportWidth,
    maxY: worldView.camera.y + viewportHeight,
  });
}
function recenter() {
  worldView.camera.x = walker.x - viewportWidth / 2;
  worldView.camera.y = walker.feetY - viewportHeight / 2;
}
const scene = app.scene(
  new Scene2D({
    async prepare({ signal }) {
      terrainImage = this.own(
        await assets.acquireImage(
          new URL(
            '../../../examples/terrain/assets/terrain.png',
            import.meta.url,
          ).href,
          {
            signal,
          },
        ),
      );
      vegetationImage = this.own(
        await assets.acquireImage(
          new URL(
            '../../../examples/terrain/assets/decorations.png',
            import.meta.url,
          ).href,
          {
            signal,
          },
        ),
      );
      retainDecorations();
      retainGround();
      status.textContent = 'Ready · original atlas / new seeded terrain';
    },
    update(dt) {
      const dx = Number(controls.down('right')) - Number(controls.down('left')),
        dy = Number(controls.down('down')) - Number(controls.down('up'));
      if (dx || dy) {
        const length = Math.hypot(dx, dy);
        walker.x = Math.max(
          -100000,
          Math.min(100000, walker.x + (dx * 96 * dt) / length),
        );
        walker.feetY = Math.max(
          -100000,
          Math.min(100000, walker.feetY + (dy * 96 * dt) / length),
        );
        recenter();
      }
      const cx = Number(controls.down('east')) - Number(controls.down('west')),
        cy = Number(controls.down('south')) - Number(controls.down('north'));
      worldView.camera.x = Math.max(
        -100000,
        Math.min(100000, worldView.camera.x + cx * 160 * dt),
      );
      worldView.camera.y = Math.max(
        -100000,
        Math.min(100000, worldView.camera.y + cy * 160 * dt),
      );
      retainDecorations();
      retainGround();
      drawList = [...visibleDecorations(), walker].sort(compareDepth);
      mask = higherMask(
        Math.floor(walker.x / tile),
        Math.floor(walker.feetY / tile),
        read,
      );
      const p = app.performance;
      const deco = decorationCache.stats;
      const text = `Decorations: ${deco.retained}/${deco.capacity} regions · ${deco.records} records · ${deco.builds} builds · ${deco.cells} region placement evaluations · last ${deco.lastMs.toFixed(2)} ms per region / peak ${deco.peakMs.toFixed(2)} ms\nTile-friendly pass ${friendly.checked ? 'on' : 'off'} · ${shaped.stats.retained}/${shaped.stats.capacity} data regions · ${shaped.stats.tileBytes} bytes · ${shaped.stats.changedCells} adjusted cells across ${shaped.stats.builds} builds\n${p?.fps?.toFixed(0) ?? '…'} FPS · update ${p?.updateMs?.toFixed(2) ?? '…'} ms · render ${p?.renderMs?.toFixed(2) ?? '…'} ms\n${regions.size} cached regions · ${builds} built · last build ${rebuildMs.toFixed(1)} ms · ${drawList.length - 1} visible objects\nWalker feet (${walker.x.toFixed(1)}, ${walker.feetY.toFixed(1)}) · reference tree Y ${treeAnchor.feetY} · ${walker.feetY < treeAnchor.feetY ? 'behind' : 'in front of'} reference tree`;
      if (meter.textContent !== text) meter.textContent = text;
      worldView.canvas.setAttribute(
        'aria-label',
        `16 pixel terrain: walker ${walker.feetY < treeAnchor.feetY ? 'behind' : 'in front of'} reference tree, ${regions.size} cached regions`,
      );
    },
    draw(ctx) {
      ctx.imageSmoothingEnabled = false;
      if (ctx.canvas !== worldView.canvas) {
        drawDiagnostics(ctx);
        return;
      }
      for (const region of regions.values())
        ctx.drawImage(region.canvas, region.x, region.y);
      for (const item of drawList) {
        if (item === walker) {
          ctx.fillStyle = '#1a2235';
          ctx.fillRect(walker.x - 5, walker.feetY - 16, 10, 14);
          ctx.fillStyle = '#ffcc55';
          ctx.fillRect(walker.x - 6, walker.feetY - 24, 12, 9);
          ctx.fillStyle = '#ff6565';
          ctx.fillRect(walker.x - 6, walker.feetY - 15, 12, 7);
        } else if (vegetationImage) {
          const object = item as Decoration;
          sprite(
            ctx,
            object.sprite.sheet === 'terrain'
              ? terrainImage!.image
              : vegetationImage.image,
            object.sprite.rect,
            object.x - object.sprite.rect[2] / 2,
            object.feetY - object.sprite.rect[3],
          );
        }
        if (debug.checked) {
          ctx.strokeStyle = item === walker ? '#ff6565' : '#44eaff';
          ctx.beginPath();
          ctx.moveTo(item.x - 8, item.feetY);
          ctx.lineTo(item.x + 8, item.feetY);
          ctx.stroke();
        }
      }
    },
    dispose() {
      for (const region of regions.values()) region.canvas.width = 0;
      regions.clear();
      drawList = [];
    },
  }),
);
scene.own(shaped);
scene.own(decorationCache);
friendly.onchange = () => {
  decorationCache.invalidate();
  for (const region of regions.values()) region.canvas.width = 0;
  regions.clear();
};
const controls = scene.own(
  app.use(Input).scope(scene, {
    left: 'KeyA',
    right: 'KeyD',
    up: 'KeyW',
    down: 'KeyS',
    west: 'ArrowLeft',
    east: 'ArrowRight',
    north: 'ArrowUp',
    south: 'ArrowDown',
  }),
);
const worldView = app.view({
  target: '#legacy-world',
  scene,
  width: viewportWidth,
  height: viewportHeight,
});
controls.bind(worldView);
const inspectorView = app.view({
  target: '#legacy-inspector',
  scene,
  width: viewportWidth,
  height: viewportHeight,
});
inspectorView.canvas.setAttribute(
  'aria-label',
  'Terrain full-frame resolver and shared depth ordering diagnostics',
);
function drawDiagnostics(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#101a28';
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);
  ctx.fillStyle = '#dbe9ed';
  ctx.font = '16px monospace';
  ctx.fillText('Full-frame overlays / original atlas', 20, 30);
  ctx.fillText('Boundary examples (same lower grass tile):', 20, 64);
  for (let i = 0; i < 22; i++) {
    const cardinal =
      (i & 1 ? 1 : 0) | (i & 2 ? 4 : 0) | (i & 4 ? 16 : 0) | (i & 8 ? 64 : 0);
    const m = i < 16 ? cardinal : ([2, 8, 32, 128, 170, 255][i - 16] ?? 0);
    const x = 24 + (i % 8) * 76,
      y = 86 + Math.floor(i / 8) * 64;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(2, 2);
    groundTile(ctx, 0, 0, 0, 0, m, 3);
    ctx.restore();
    ctx.fillStyle = '#dbe9ed';
    ctx.fillText(m.toString(16).padStart(2, '0'), x, y + 48);
  }
  ctx.fillText(
    `Walker tile neighbor mask: ${mask.toString(2).padStart(8, '0')}`,
    20,
    288,
  );
  const frames = resolveFrames(mask);
  ctx.fillText(
    `Full 16 × 16 frames: ${frames.join(' + ') || 'flat base'}`,
    20,
    316,
  );
  ctx.fillText('Adjacent edges use their authored corner.', 20, 344);
  ctx.fillText('Separate edges / inner corners compose in alpha.', 20, 372);
  ctx.fillText('Depth queue near reference tree (back → front):', 20, 420);
  const nearby = [...drawList].filter(
    (item) => item.id === walker.id || item.id === treeAnchor.id,
  );
  nearby.forEach((item, i) =>
    ctx.fillText(
      `${item.id.padEnd(16)} feet Y ${item.feetY.toFixed(1)}`,
      20,
      446 + i * 22,
    ),
  );
}
for (const [id, offset] of [
  ['behind', -32],
  ['front', 16],
] as const)
  element(`#legacy-${id}`, HTMLButtonElement).onclick = () => {
    walker.x = treeAnchor.x;
    walker.feetY = treeAnchor.feetY + offset;
    recenter();
    worldView.canvas.focus();
  };
element('#legacy-center', HTMLButtonElement).onclick = () => {
  recenter();
  worldView.canvas.focus();
};
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) void app.dispose();
});
recenter();
try {
  await app.start();
} catch (error) {
  status.textContent = `Asset loading failed: ${String(error)} · reload to retry`;
}
