// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * render.ts — draws the vertical lane track to a 2D canvas.
 *
 * The runner sits at a fixed screen line; the WORLD scrolls past it based on the
 * runner's distance, hazards descending from the top and the dark rising from below.
 * Nothing here mutates game state — it is a pure view over a RunState.
 */

import type { Mode } from './modes';
import { JUMP_DUR, gapOf, type RunState, type TrackEvent } from './game';
import type { Fx } from './fx';

export const COLORS = {
  bg: '#0a0713',
  ember: '#ffb020',
  emberCore: '#fff2c4',
  mote: '#37e0ff',
  gate: '#ff3ea5',
  block: '#ff6b3d',
  low: '#ecc94b',
  pitRing: '#3a2a5e',
  lane: 'rgba(255,255,255,0.05)',
  ghost: '#8b9bff',
};

const VISIBLE_M = 60;

export interface View {
  cssW: number;
  cssH: number;
  actionY: number;
  pxPerM: number;
  laneW: number;
  playX0: number;
  playW: number;
  lanes: number;
}

export function computeView(cssW: number, cssH: number, lanes: number): View {
  const actionY = cssH * 0.72;
  const pxPerM = actionY / VISIBLE_M;
  const playW = Math.min(cssW - 12, 520);
  const laneW = playW / lanes;
  const playX0 = (cssW - playW) / 2;
  return { cssW, cssH, actionY, pxPerM, laneW, playX0, playW, lanes };
}

function laneX(v: View, lane: number): number {
  return v.playX0 + (lane + 0.5) * v.laneW;
}

/** screen y for a track distance, given the runner's (interpolated) distance. */
function yFor(v: View, evD: number, x: number): number {
  return v.actionY - (evD - x) * v.pxPerM;
}

export interface GhostSample {
  x: number;
  lane: number;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  v: View,
  s: RunState,
  mode: Mode,
  track: TrackEvent[],
  fx: Fx,
  xRender: number,
  ghost: GhostSample | null,
  reduced: boolean,
): void {
  const { cssW, cssH } = v;

  // background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, cssW, cssH);

  const off = fx.shakeOffset();
  ctx.save();
  ctx.translate(off.x, off.y);

  // lane guides
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.lane;
  for (let i = 0; i <= v.lanes; i++) {
    const x = v.playX0 + i * v.laneW;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH);
    ctx.stroke();
  }
  // horizon glow at the top (where the track emerges from)
  const topGrad = ctx.createLinearGradient(0, 0, 0, cssH * 0.3);
  topGrad.addColorStop(0, 'rgba(90,60,160,0.20)');
  topGrad.addColorStop(1, 'rgba(90,60,160,0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(v.playX0, 0, v.playW, cssH * 0.3);

  // events — bounded scan around the runner
  const aheadM = (v.actionY + 60) / v.pxPerM;
  const behindM = (cssH - v.actionY + 60) / v.pxPerM;
  let start = Math.max(0, s.overIdx - 10);
  while (start > 0 && xRender - track[start].d < behindM) start--;
  for (let i = start; i < track.length; i++) {
    const ev = track[i];
    if (ev.d - xRender > aheadM) break;
    if (xRender - ev.d > behindM) continue;
    drawEvent(ctx, v, ev, xRender);
  }

  // the dark, rising from below
  drawDark(ctx, v, s, mode, reduced);

  // ghost rival / own-best
  if (ghost) {
    const gy = yFor(v, ghost.x, xRender);
    if (gy > -40 && gy < cssH + 40) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = COLORS.ghost;
      ctx.shadowColor = COLORS.ghost;
      ctx.shadowBlur = 12;
      const gx = laneX(v, ghost.lane);
      ctx.beginPath();
      ctx.arc(gx, gy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // runner
  drawRunner(ctx, v, s, reduced);

  ctx.restore();

  // particles (screen space, not shaken so they read as world debris)
  fx.draw(ctx);

  // near-death vignette
  const gap = gapOf(s);
  if (s.alive && gap < 22) {
    const t = 1 - Math.max(0, gap) / 22;
    const g = ctx.createRadialGradient(
      cssW / 2,
      v.actionY,
      cssH * 0.2,
      cssW / 2,
      v.actionY,
      cssH * 0.75,
    );
    g.addColorStop(0, 'rgba(255,40,90,0)');
    g.addColorStop(1, `rgba(255,20,70,${0.55 * t})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
  }
}

function drawEvent(ctx: CanvasRenderingContext2D, v: View, ev: TrackEvent, x: number): void {
  const y = yFor(v, ev.d, x);
  if (ev.kind === 'gate') {
    const h = 12 * v.pxPerM;
    const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, 'rgba(255,62,165,0)');
    g.addColorStop(0.5, 'rgba(255,62,165,0.85)');
    g.addColorStop(1, 'rgba(255,62,165,0)');
    ctx.fillStyle = g;
    ctx.fillRect(v.playX0, y - h / 2, v.playW, h);
    ctx.strokeStyle = COLORS.gate;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(v.playX0, y);
    ctx.lineTo(v.playX0 + v.playW, y);
    ctx.stroke();
    return;
  }

  const cx = laneX(v, ev.lane);
  const w = v.laneW * 0.66;
  switch (ev.kind) {
    case 'block': {
      const h = 4 * v.pxPerM;
      ctx.fillStyle = COLORS.block;
      ctx.shadowColor = COLORS.block;
      ctx.shadowBlur = 10;
      roundRect(ctx, cx - w / 2, y - h / 2, w, h, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
    }
    case 'pit': {
      const rw = w * 0.62;
      const rh = 3.4 * v.pxPerM;
      ctx.fillStyle = '#04030a';
      ctx.beginPath();
      ctx.ellipse(cx, y, rw / 2, rh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.pitRing;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case 'low': {
      // an overhang bar hanging from the top of the lane cell — slide under it
      const h = 2.6 * v.pxPerM;
      ctx.fillStyle = COLORS.low;
      ctx.shadowColor = COLORS.low;
      ctx.shadowBlur = 8;
      roundRect(ctx, cx - w / 2, y - h, w, h, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
    }
    case 'mote': {
      const r = Math.min(v.laneW * 0.2, 13);
      ctx.save();
      ctx.translate(cx, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = COLORS.mote;
      ctx.shadowColor = COLORS.mote;
      ctx.shadowBlur = 14;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = '#eafffd';
      ctx.fillRect(-r * 0.4, -r * 0.4, r * 0.8, r * 0.8);
      ctx.restore();
      break;
    }
  }
}

function drawDark(
  ctx: CanvasRenderingContext2D,
  v: View,
  s: RunState,
  _mode: Mode,
  reduced: boolean,
): void {
  const gap = gapOf(s);
  const edgeY = v.actionY + gap * v.pxPerM;
  if (edgeY > v.cssH + 4) return; // dark still off the bottom
  const g = ctx.createLinearGradient(0, edgeY - 40, 0, v.cssH);
  g.addColorStop(0, 'rgba(10,4,20,0)');
  g.addColorStop(0.35, 'rgba(12,3,26,0.85)');
  g.addColorStop(1, '#020006');
  ctx.fillStyle = g;
  ctx.fillRect(0, edgeY - 40, v.cssW, v.cssH - edgeY + 44);

  // tendrils along the leading edge
  ctx.strokeStyle = 'rgba(150,70,220,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const teeth = 14;
  for (let i = 0; i <= teeth; i++) {
    const px = (i / teeth) * v.cssW;
    const wob = reduced ? 0 : Math.sin(i * 1.7 + s.time * 6) * 8;
    const py = edgeY + wob;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function drawRunner(
  ctx: CanvasRenderingContext2D,
  v: View,
  s: RunState,
  reduced: boolean,
): void {
  const cx = laneX(v, s.lane);
  const jumpT = s.air > 0 ? 1 - s.air / JUMP_DUR : 0;
  const lift = s.air > 0 ? Math.sin(Math.PI * jumpT) * (v.pxPerM * 5) : 0;
  const sliding = s.slide > 0;
  const y = v.actionY - lift;

  // shadow on the ground when airborne
  if (lift > 2) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx, v.actionY + 6, 14 - lift * 0.02, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const r = Math.min(v.laneW * 0.28, 18);
  const rx = sliding ? r * 1.35 : r;
  const ry = sliding ? r * 0.55 : r;
  const hot = s.surging ? '#ffffff' : COLORS.emberCore;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(cx, y, 0, cx, y, r * (s.surging ? 3.4 : 2.4));
  const glowColor = s.surging ? 'rgba(255,120,40,0.9)' : 'rgba(255,150,40,0.7)';
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, y, r * (s.surging ? 3.4 : 2.4), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = COLORS.ember;
  ctx.beginPath();
  ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hot;
  ctx.beginPath();
  ctx.ellipse(cx, y, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // a little flame flick unless reduced motion
  if (!reduced) {
    ctx.fillStyle = 'rgba(255,220,120,0.6)';
    const flick = Math.sin(s.time * 30) * 2;
    ctx.beginPath();
    ctx.ellipse(cx + flick, y - ry - 4, rx * 0.35, ry * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
