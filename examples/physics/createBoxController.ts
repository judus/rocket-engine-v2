import type { PhysicsBody } from '../../src/physics/matter.js';

interface Actions {
  down(action: 'left' | 'right'): boolean;
  pressed(action: 'boost'): boolean;
}

/** Narrow dependencies: fixed actions and a body, with no engine or scene lookup. */
export function createBoxController(body: PhysicsBody, actions: Actions) {
  let boosts = 0;
  return {
    get boosts() {
      return boosts;
    },
    update(): undefined {
      if (body.disposed) return;
      const direction =
        Number(actions.down('right')) - Number(actions.down('left'));
      let y = body.velocity.y;
      if (actions.pressed('boost')) {
        y = -600;
        boosts++;
      }
      body.setVelocity({ x: direction * 160, y });
    },
  };
}
