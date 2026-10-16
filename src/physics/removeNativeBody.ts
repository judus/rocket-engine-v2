import Matter from 'matter-js';
import type { Body, Collision, Engine, Pair } from 'matter-js';

// Matter 0.20.0 runtime fields omitted by its declarations. Keep backend details
// here; consumers never receive native bodies, pairs or the engine.
interface PairCache {
  list: Pair[];
  table: Record<string, Pair>;
  collisionStart: Pair[];
  collisionActive: Pair[];
  collisionEnd: Pair[];
}
function retain<T>(items: T[], keep: (item: T) => boolean) {
  let count = 0;
  for (const item of items) if (keep(item)) items[count++] = item;
  items.length = count;
}

/** Release only references involving the removed rectangle; preserve other pairs. */
export function removeNativeBody(
  engine: Engine,
  body: Body,
  live: Body[],
): void {
  const keep = (pair: Pair) => pair.bodyA !== body && pair.bodyB !== body;
  const pairs = engine.pairs as PairCache;
  for (const list of [
    pairs.list,
    pairs.collisionStart,
    pairs.collisionActive,
    pairs.collisionEnd,
  ])
    retain(list, keep);
  for (const [key, pair] of Object.entries(pairs.table))
    if (!keep(pair)) delete pairs.table[key];
  Matter.Detector.setBodies(engine.detector, live);
  const detector = engine.detector as Matter.Detector & {
    collisions: Collision[];
  };
  retain(
    detector.collisions,
    (collision) => collision.bodyA !== body && collision.bodyB !== body,
  );
}
