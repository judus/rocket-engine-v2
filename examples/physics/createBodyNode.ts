import { Node2D } from '../../src/index.js';
import type { PhysicsBody } from '../../src/physics/matter.js';

/** Node owns the body lease. Physics owns the pose; behavior copies it for display. */
export function createBodyNode(
  body: PhysicsBody,
  onCleanup: () => void = () => {},
  color = '#80dbbd',
) {
  const node = new Node2D({
    x: body.pose.x,
    y: body.pose.y,
    draw(ctx) {
      if (body.disposed) return;
      ctx.fillStyle =
        body.kind === 'dynamic'
          ? color
          : body.kind === 'sensor'
            ? '#eb8fba44'
            : '#f1b973';
      ctx.fillRect(-body.width / 2, -body.height / 2, body.width, body.height);
      if (body.kind === 'sensor') {
        ctx.strokeStyle = '#eb8fba';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          -body.width / 2,
          -body.height / 2,
          body.width,
          body.height,
        );
      }
    },
  });
  node.attach({
    update() {
      if (body.disposed) return;
      const pose = body.pose;
      node.x = pose.x;
      node.y = pose.y;
      node.rotation = pose.angle;
    },
    dispose() {
      try {
        body.dispose();
      } finally {
        onCleanup();
      }
    },
  });
  return node;
}
