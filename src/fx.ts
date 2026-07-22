// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * fx.ts — particles + screen shake. Screen-space, cheap, and fully skipped /
 * reduced when the player prefers reduced motion.
 */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  grav: number;
}

export class Fx {
  parts: Particle[] = [];
  shakeAmt = 0;
  private reduced: boolean;

  constructor(reducedMotion: boolean) {
    this.reduced = reducedMotion;
  }

  setReduced(r: boolean): void {
    this.reduced = r;
  }

  shake(amount: number): void {
    if (this.reduced) return;
    this.shakeAmt = Math.min(24, Math.max(this.shakeAmt, amount));
  }

  burst(
    x: number,
    y: number,
    n: number,
    color: string,
    opts: { speed?: number; spread?: number; up?: number; life?: number; size?: number; grav?: number } = {},
  ): void {
    const count = this.reduced ? Math.ceil(n / 3) : n;
    const speed = opts.speed ?? 160;
    const life = opts.life ?? 0.55;
    const size = opts.size ?? 3;
    const grav = opts.grav ?? 320;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (opts.up ?? 0),
        life,
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        grav,
      });
    }
    if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);
  }

  update(dt: number): void {
    this.shakeAmt *= Math.pow(0.001, dt); // fast decay
    if (this.shakeAmt < 0.15) this.shakeAmt = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  shakeOffset(): { x: number; y: number } {
    if (this.shakeAmt <= 0) return { x: 0, y: 0 };
    const a = this.shakeAmt;
    return { x: (Math.random() * 2 - 1) * a, y: (Math.random() * 2 - 1) * a };
  }

  clear(): void {
    this.parts.length = 0;
    this.shakeAmt = 0;
  }
}
