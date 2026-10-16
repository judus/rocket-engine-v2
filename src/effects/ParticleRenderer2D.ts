import type { Particles2D, ParticleSample2D } from './Particles2D.js';
/** Canvas adapter only. Uses one scratch sample; never advances the simulation. */
export class ParticleRenderer2D {
  #sample: ParticleSample2D = { x: 0, y: 0, size: 0, opacity: 0, color: '' };
  constructor(
    readonly particles: Particles2D,
    readonly additive = false,
  ) {}
  draw(ctx: CanvasRenderingContext2D): undefined {
    ctx.save();
    try {
      if (this.additive) ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.particles.count; i++) {
        this.particles.sample(i, this.#sample);
        const p = this.#sample;
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    } finally {
      ctx.restore();
    }
  }
}
