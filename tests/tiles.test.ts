import test from 'node:test';
import assert from 'node:assert/strict';
import { Node2D } from '../src/index.js';
import { createTileSummary } from '../examples/createTileSummary.js';
import { TileBoard } from '../examples/TileBoard.js';
import { createTileBoard } from '../examples/createTileBoard.js';

void test('finite tile lookup floors signed coordinates and excludes upper boundaries', () => {
  const board = new TileBoard();
  assert.deepEqual(board.cellAt({ x: -0.01, y: -0.01 }), { x: -1, y: -1 });
  assert.deepEqual(board.cellAt({ x: -256, y: -160 }), { x: -8, y: -5 });
  assert.deepEqual(board.cellAt({ x: 255.99, y: 159.99 }), { x: 7, y: 4 });
  for (const point of [
    { x: -256.01, y: 0 },
    { x: 256, y: 0 },
    { x: 0, y: 160 },
    { x: NaN, y: 0 },
  ])
    assert.equal(board.cellAt(point), null);
  assert.equal(board.get({ x: -0.5, y: 0 }), null);
});

void test('tile edits wrap independently without row aliasing; invalid edits do not change revision', () => {
  const board = new TileBoard();
  for (const cell of [
    { x: -8, y: -5 },
    { x: 7, y: -5 },
    { x: -8, y: -4 },
    { x: 7, y: 4 },
  ]) {
    assert.equal(board.get(cell), 0);
    board.cycle(cell);
    assert.equal(board.get(cell), 1);
  }
  assert.equal(board.revision, 4);
  board.cycle({ x: -8, y: -5 });
  board.cycle({ x: -8, y: -5 });
  assert.equal(board.get({ x: -8, y: -5 }), 0);
  assert.equal(board.get({ x: 7, y: -5 }), 1);
  assert.equal(board.cycle({ x: 8, y: 0 }), false);
  assert.equal(board.revision, 6);
});

void test('board presentation converts ancestor transforms; disposal releases presentation, retains host data', () => {
  const board = new TileBoard();
  let cleaned = 0;
  const parent = new Node2D({
    x: 100,
    y: -40,
    rotation: Math.PI / 2,
    scaleX: 2,
  });
  const object = createTileBoard(board, () => {
    cleaned++;
  });
  parent.add(object.node);
  assert.equal(object.edit(object.node.localToWorld({ x: -16, y: -16 })), true);
  assert.deepEqual(object.selected, { x: -1, y: -1 });
  assert.equal(board.get({ x: -1, y: -1 }), 1);
  assert.equal(object.edit(object.node.localToWorld({ x: 256, y: 0 })), false);
  parent.dispose();
  parent.dispose();
  assert.equal(cleaned, 1);
  assert.equal(board.get({ x: -1, y: -1 }), 1);
  assert.throws(() => object.edit({ x: 0, y: 0 }), /disposed/);
});

void test('summary reads current shared state without advancing or mutating it', () => {
  const board = new TileBoard();
  const summary = createTileSummary(board);
  assert.equal(summary.update, undefined);
  const labels: string[] = [];
  const context = {
    fillStyle: '',
    font: '',
    fillRect() {},
    fillText(text: string) {
      labels.push(text);
    },
  } as unknown as CanvasRenderingContext2D;
  const draw = () => summary.draw?.(context, { dt: 0, time: 0 });
  draw();
  assert.equal(labels[0], '0 / 160');
  const cell = { x: -1, y: -1 };
  for (const [terrain, active] of [
    [1, 1],
    [2, 1],
    [0, 0],
  ] as const) {
    board.cycle(cell);
    labels.length = 0;
    const revision = board.revision;
    draw();
    assert.equal(board.get(cell), terrain);
    assert.equal(board.revision, revision);
    assert.equal(labels[0], `${active} / 160`);
    assert.deepEqual(board.counts, {
      mint: terrain === 1 ? 1 : 0,
      sand: terrain === 2 ? 1 : 0,
      active,
      empty: 160 - active,
      total: 160,
    });
  }
});
