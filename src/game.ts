// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * game.ts — the deterministic Emberwake simulation. Pure logic, no DOM, no audio.
 *
 * Everything the world does is a function of (seed, mode, input sequence) stepped
 * at a fixed rate. That single property gives us: byte-identical daily-seed tracks,
 * a replayable own-best ghost, and a bot the balance sim can drive over hundreds of
 * seeds. Keep it that way — never call Math.random() in here, never touch `Date`.
 *
 * The world is a vertical lane track. The runner auto-advances; `x` (metres) is both
 * position and score. A wall of dark chases at a floor speed that RISES with distance,
 * so every run is bounded — skill (keeping momentum, hence speed, high) decides how far.
 */

import type { EventKind, Mode } from './modes';
import { makeRng, randInt } from './engine/rng';

export const JUMP_DUR = 0.5;
export const SLIDE_DUR = 0.45;

export interface TrackEvent {
  id: number;
  d: number; // distance (metres) at which it resolves
  kind: EventKind;
  lane: number; // -1 for a gate (spans all lanes)
}

export interface RunState {
  x: number; // distance travelled = score
  xDark: number; // the dark's position (behind the runner)
  lane: number;
  air: number; // seconds of jump remaining (>0 = airborne)
  slide: number; // seconds of slide remaining
  m: number; // momentum [0,1] — speed AND life AND how far you'll get
  surging: boolean;
  alive: boolean;
  cause: 'dark' | 'chasm' | null;
  overIdx: number; // next unresolved event index
  // running tally for the results screen
  motes: number;
  nearMisses: number;
  hits: number;
  gates: number;
  gatesMissed: number;
  time: number; // sim seconds elapsed
}

export interface StepInput {
  move: -1 | 0 | 1; // lane delta applied this step (edge-triggered by the caller)
  jump: boolean;
  slide: boolean;
  surge: boolean;
}

/** What resolved this step, so the live layer can fire sfx / particles. */
export interface StepReport {
  laneChanged: boolean;
  jumped: boolean;
  slid: boolean;
  mote: number; // motes collected this step
  near: number; // near-misses threaded this step
  hit: number; // hazards clipped this step
  gate: boolean; // crossed a chasm this step
  died: boolean;
}

const NO_REPORT = (): StepReport => ({
  laneChanged: false,
  jumped: false,
  slid: false,
  mote: 0,
  near: 0,
  hit: 0,
  gate: false,
  died: false,
});

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Theoretical distance the dark's ramp needs to overtake top speed, plus a buffer. */
export function maxDistance(mode: Mode): number {
  return Math.ceil((mode.vMax - mode.darkBase) / mode.darkRamp) + mode.gapMax + 1200;
}

/** Generate the whole track deterministically from the seed. */
export function genTrack(seed: number, mode: Mode): TrackEvent[] {
  const rng = makeRng((seed >>> 0) ^ 0x9e3779b9);
  const evs: TrackEvent[] = [];
  const maxD = maxDistance(mode);
  let d = mode.firstEventAt;
  let id = 0;
  let sinceGate = 0;

  while (d < maxD) {
    const t = clamp(d / mode.tightenOver, 0, 1);
    const baseSp = mode.baseSpacing + (mode.minSpacing - mode.baseSpacing) * t;
    const sp = Math.max(mode.minSpacing, baseSp * (1 + (rng() * 2 - 1) * mode.jitter));
    d += sp;
    sinceGate += sp;
    if (d >= maxD) break;

    if (sinceGate >= mode.gateEvery) {
      evs.push({ id: id++, d, kind: 'gate', lane: -1 });
      sinceGate = 0;
      d += mode.minSpacing * 1.4; // a breather right after a chasm
      continue;
    }

    if (rng() < mode.moteChance) {
      evs.push({ id: id++, d, kind: 'mote', lane: randInt(rng, 0, mode.lanes - 1) });
      continue;
    }

    // A hazard. Exactly one lane, so at least one lane is always safe → the track
    // is always survivable by dodging. Reward comes from threading, not surviving.
    const roll = rng();
    const kind: EventKind = roll < 0.4 ? 'block' : roll < 0.72 ? 'pit' : 'low';
    evs.push({ id: id++, d, kind, lane: randInt(rng, 0, mode.lanes - 1) });
  }
  return evs;
}

export function createRun(mode: Mode): RunState {
  return {
    x: 0,
    xDark: -mode.gap0,
    lane: Math.floor(mode.lanes / 2),
    air: 0,
    slide: 0,
    m: mode.mStart,
    surging: false,
    alive: true,
    cause: null,
    overIdx: 0,
    motes: 0,
    nearMisses: 0,
    hits: 0,
    gates: 0,
    gatesMissed: 0,
    time: 0,
  };
}

export function speedOf(s: RunState, mode: Mode): number {
  const base = mode.vMin + s.m * (mode.vMax - mode.vMin);
  return base + (s.surging ? mode.surgeBoost : 0);
}

export function darkSpeedOf(s: RunState, mode: Mode): number {
  return mode.darkBase + mode.darkRamp * s.x;
}

/** metres of lead the runner holds over the dark. <= 0 means caught. */
export function gapOf(s: RunState): number {
  return s.x - s.xDark;
}

function resolve(s: RunState, mode: Mode, ev: TrackEvent, r: StepReport): void {
  switch (ev.kind) {
    case 'block':
      if (s.lane === ev.lane) {
        s.m = Math.max(0, s.m - mode.drainBlock);
        s.hits++;
        r.hit++;
      } else if (Math.abs(s.lane - ev.lane) === 1) {
        s.m = Math.min(1, s.m + mode.refillNear); // threaded past, hairline
        s.nearMisses++;
        r.near++;
      }
      break;
    case 'pit':
      if (s.lane === ev.lane) {
        if (s.air > 0) {
          s.m = Math.min(1, s.m + mode.refillNear);
          s.nearMisses++;
          r.near++;
        } else {
          s.m = Math.max(0, s.m - mode.drainPit);
          s.hits++;
          r.hit++;
        }
      }
      break;
    case 'low':
      if (s.lane === ev.lane) {
        if (s.slide > 0) {
          s.m = Math.min(1, s.m + mode.refillNear);
          s.nearMisses++;
          r.near++;
        } else {
          s.m = Math.max(0, s.m - mode.drainLow);
          s.hits++;
          r.hit++;
        }
      }
      break;
    case 'mote':
      // motes float at head height — a slide ducks under and misses them.
      if (s.lane === ev.lane && s.slide <= 0) {
        s.m = Math.min(1, s.m + mode.refillMote);
        s.motes++;
        r.mote++;
      }
      break;
    case 'gate':
      if (s.surging) {
        s.m = Math.max(0, s.m - mode.gateCost);
        s.gates++;
        r.gate = true;
      } else {
        s.alive = false;
        s.cause = 'chasm';
        s.gatesMissed++;
        r.died = true;
      }
      break;
  }
}

/** Advance the world by exactly `dt` seconds. Mutates `s`, returns what happened. */
export function stepRun(
  s: RunState,
  mode: Mode,
  track: TrackEvent[],
  input: StepInput,
  dt: number,
): StepReport {
  const r = NO_REPORT();
  if (!s.alive) return r;

  s.time += dt;

  if (input.move !== 0) {
    const next = clamp(s.lane + input.move, 0, mode.lanes - 1);
    if (next !== s.lane) {
      s.lane = next;
      r.laneChanged = true;
    }
  }
  if (input.jump && s.air <= 0 && s.slide <= 0) {
    s.air = JUMP_DUR;
    r.jumped = true;
  }
  if (input.slide && s.slide <= 0 && s.air <= 0) {
    s.slide = SLIDE_DUR;
    r.slid = true;
  }

  s.surging = input.surge && s.m > 0;

  if (s.air > 0) s.air = Math.max(0, s.air - dt);
  if (s.slide > 0) s.slide = Math.max(0, s.slide - dt);

  // the spark cools — momentum bleeds unless you keep feeding it. This is what
  // makes a run a constant fight for upkeep rather than a free cruise to the wall.
  s.m = Math.max(0, s.m - mode.mDecay * dt);

  if (s.surging) {
    s.m = Math.max(0, s.m - mode.surgeDrain * dt);
    if (s.m <= 0) s.surging = false;
  }

  const v = speedOf(s, mode);
  const darkV = darkSpeedOf(s, mode);
  s.x += v * dt;
  s.xDark += darkV * dt;
  if (s.x - s.xDark > mode.gapMax) s.xDark = s.x - mode.gapMax;

  while (s.overIdx < track.length && track[s.overIdx].d <= s.x) {
    resolve(s, mode, track[s.overIdx], r);
    s.overIdx++;
    if (!s.alive) break;
  }

  if (s.alive && s.xDark >= s.x) {
    s.alive = false;
    s.cause = 'dark';
    r.died = true;
  }

  return r;
}
