import type { Node3D } from './Node3D.js';
import { collectFaces } from './collectFaces.js';
import type { PerspectiveCamera, Vec3 } from './PerspectiveCamera.js';
import { projectFaces } from './SolidFaces.js';
import type { Face } from './SolidFaces.js';

/** Stateless Canvas2D backend. Caller owns context, camera, viewport and frame timing. */
export class CanvasRenderer3D {
  line(
    ctx: CanvasRenderingContext2D,
    camera: PerspectiveCamera,
    width: number,
    height: number,
    a: Vec3,
    b: Vec3,
    color: string,
    weight = 1,
  ): boolean {
    const segment = camera.segment(a, b, width, height);
    if (!segment) return false;
    ctx.save();
    try {
      ctx.strokeStyle = color;
      ctx.lineWidth = weight;
      ctx.beginPath();
      ctx.moveTo(segment[0].x, segment[0].y);
      ctx.lineTo(segment[1].x, segment[1].y);
      ctx.stroke();
    } finally {
      ctx.restore();
    }
    return true;
  }
  render(
    ctx: CanvasRenderingContext2D,
    root: Node3D,
    camera: PerspectiveCamera,
    width: number,
    height: number,
    outline?: { readonly color: string; readonly width: number },
  ) {
    return this.drawFaces(
      ctx,
      collectFaces(root),
      camera,
      width,
      height,
      outline,
    );
  }
  /** Also accepts cached world geometry for static assemblies. No depth buffer. */
  drawFaces(
    ctx: CanvasRenderingContext2D,
    faces: readonly Face[],
    camera: PerspectiveCamera,
    width: number,
    height: number,
    outline?: { readonly color: string; readonly width: number },
  ) {
    const result = projectFaces(faces, camera, width, height);
    ctx.save();
    try {
      for (const face of result.visible) {
        ctx.beginPath();
        face.points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fillStyle = face.color;
        ctx.fill();
        if (outline) {
          ctx.strokeStyle = outline.color;
          ctx.lineWidth = outline.width;
          ctx.stroke();
        }
      }
    } finally {
      ctx.restore();
    }
    return result;
  }
}
