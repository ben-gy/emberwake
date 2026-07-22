// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * bot.ts — a reactive runner-bot that plays a track for the balance sim.
 *
 * It is NOT omniscient-perfect: it reads the track a fixed distance ahead, dodges
 * or threads hazards, grabs motes when they are safe, and mistimes a thread with a
 * small probability (seeded, so still deterministic) — that injected risk is what
 * makes momentum a genuine resource instead of a free refill, so run length varies
 * with skill and the surge economy actually matters.
 *
 * Three surge policies let the balance sim prove that a MIXED "spend at chasms and to
 * escape the closing dark" line beats both pure-hoarding and surge-spam (see plan.md).
 */

import type { Mode } from './modes';
import {
  createRun,
  gapOf,
  genTrack,
  maxDistance,
  stepRun,
  type RunState,
  type StepInput,
  type TrackEvent,
} from './game';
import { makeRng, type Rng } from './engine/rng';

/**
 * The three surge lines the balance sim pits against each other:
 *  - purehoard: never dumps momentum into a surge → can't cross a chasm → dies at the first.
 *  - spam:      surges whenever it can → bleeds momentum → chronically slow, caught early.
 *  - mixed:     surges to cross chasms and to escape the closing dark → wins by a mile.
 */
export type SurgePolicy = 'purehoard' | 'spam' | 'mixed';

export interface BotOpts {
  policy: SurgePolicy;
  /** decorrelates the mistime rolls from the track seed. */
  skillSeed?: number;
  missP?: number;
  reactM?: number;
  actM?: number;
  threadTarget?: number;
  surgeLeadM?: number;
  escapeThresh?: number;
  escapeMinM?: number;
}

export interface BotResult {
  distance: number;
  time: number;
  cause: 'dark' | 'chasm' | null;
  motes: number;
  near: number;
  hits: number;
  gates: number;
  gatesMissed: number;
  endM: number;
}

const DEF = {
  missP: 0.05,
  reactM: 62,
  actM: 15,
  threadTarget: 0.85,
  surgeLeadM: 11,
  escapeThresh: 32,
  escapeMinM: 0.06,
};

/** nearest event of a kind-set in a lane, ahead within `within` metres. */
function nextHazard(
  s: RunState,
  track: TrackEvent[],
  within: number,
): TrackEvent | null {
  for (let i = s.overIdx; i < track.length; i++) {
    const ev = track[i];
    if (ev.d <= s.x) continue;
    if (ev.d - s.x > within) return null;
    if (ev.kind === 'block' || ev.kind === 'pit' || ev.kind === 'low') return ev;
  }
  return null;
}

function nextGate(s: RunState, track: TrackEvent[], within: number): TrackEvent | null {
  for (let i = s.overIdx; i < track.length; i++) {
    const ev = track[i];
    if (ev.d <= s.x) continue;
    if (ev.d - s.x > within) return null;
    if (ev.kind === 'gate') return ev;
  }
  return null;
}

/** Does lane `c` have a hard block within `within` metres ahead? */
function laneBlocked(s: RunState, track: TrackEvent[], c: number, within: number): boolean {
  for (let i = s.overIdx; i < track.length; i++) {
    const ev = track[i];
    if (ev.d <= s.x) continue;
    if (ev.d - s.x > within) return false;
    if (ev.kind === 'block' && ev.lane === c) return true;
  }
  return false;
}

function moteAhead(s: RunState, track: TrackEvent[], c: number, within: number): boolean {
  for (let i = s.overIdx; i < track.length; i++) {
    const ev = track[i];
    if (ev.d <= s.x) continue;
    if (ev.d - s.x > within) return false;
    if (ev.kind === 'mote' && ev.lane === c) return true;
    if ((ev.kind === 'block' || ev.kind === 'pit' || ev.kind === 'low') && ev.lane === c)
      return false; // a hazard sits before the mote in this lane
  }
  return false;
}

function decide(
  s: RunState,
  mode: Mode,
  track: TrackEvent[],
  opts: Required<Omit<BotOpts, 'skillSeed'>>,
  rng: Rng,
): StepInput {
  const input: StepInput = { move: 0, jump: false, slide: false, surge: false };

  // ── lane + thread/dodge for the imminent hazard ──────────────────────────────
  const haz = nextHazard(s, track, opts.actM);
  let targetLane = s.lane;

  if (haz) {
    const inLane = haz.lane === s.lane;
    if (inLane) {
      if (haz.kind === 'block') {
        // must leave — pick a safe adjacent lane
        targetLane = pickSafeAdjacent(s, mode, track, opts.actM * 1.4);
      } else {
        // pit / low — thread it for the refill if we want momentum, else dodge
        const wantRefill = s.m < opts.threadTarget;
        const safe = pickSafeAdjacent(s, mode, track, opts.actM * 1.4);
        if (wantRefill || safe === s.lane) {
          // thread: stay and jump/slide (with a chance to mistime)
          const mistime = rng() < opts.missP;
          if (!mistime) {
            if (haz.kind === 'pit') input.jump = true;
            else input.slide = true;
          }
        } else {
          targetLane = safe;
        }
      }
    }
  } else {
    // no imminent hazard — drift toward a nearby mote if the lane is clean
    for (const c of [s.lane, s.lane - 1, s.lane + 1]) {
      if (c < 0 || c >= mode.lanes) continue;
      if (moteAhead(s, track, c, opts.reactM) && !laneBlocked(s, track, c, opts.actM)) {
        targetLane = c;
        break;
      }
    }
  }

  input.move = Math.sign(targetLane - s.lane) as -1 | 0 | 1;

  // ── surge policy ─────────────────────────────────────────────────────────────
  const gate = nextGate(s, track, opts.surgeLeadM);
  const gateNeeded = gate !== null;
  if (opts.policy === 'purehoard') {
    input.surge = false; // never spends — hoards momentum to the grave at the first chasm
  } else if (opts.policy === 'spam') {
    input.surge = s.m > 0; // always spending — perpetually momentum-starved
  } else {
    // mixed: cross chasms, and burn momentum to buy distance when the dark closes in.
    const escaping = gapOf(s) < opts.escapeThresh && s.m > opts.escapeMinM;
    input.surge = gateNeeded || escaping;
  }

  return input;
}

function pickSafeAdjacent(
  s: RunState,
  mode: Mode,
  track: TrackEvent[],
  within: number,
): number {
  const cands = [s.lane - 1, s.lane + 1, s.lane].filter((c) => c >= 0 && c < mode.lanes);
  // prefer a lane with no hazard at all within the window; fall back to no-block
  for (const c of cands) {
    if (c === s.lane) continue;
    if (!laneBlocked(s, track, c, within) && !laneHasAny(s, track, c, within * 0.6)) return c;
  }
  for (const c of cands) {
    if (c === s.lane) continue;
    if (!laneBlocked(s, track, c, within)) return c;
  }
  return s.lane;
}

function laneHasAny(s: RunState, track: TrackEvent[], c: number, within: number): boolean {
  for (let i = s.overIdx; i < track.length; i++) {
    const ev = track[i];
    if (ev.d <= s.x) continue;
    if (ev.d - s.x > within) return false;
    if ((ev.kind === 'block' || ev.kind === 'pit' || ev.kind === 'low') && ev.lane === c)
      return true;
  }
  return false;
}

export function runBot(seed: number, mode: Mode, botOpts: BotOpts): BotResult {
  const opts: Required<Omit<BotOpts, 'skillSeed'>> = {
    policy: botOpts.policy,
    missP: botOpts.missP ?? DEF.missP,
    reactM: botOpts.reactM ?? DEF.reactM,
    actM: botOpts.actM ?? DEF.actM,
    threadTarget: botOpts.threadTarget ?? DEF.threadTarget,
    surgeLeadM: botOpts.surgeLeadM ?? DEF.surgeLeadM,
    escapeThresh: botOpts.escapeThresh ?? DEF.escapeThresh,
    escapeMinM: botOpts.escapeMinM ?? DEF.escapeMinM,
  };
  const track = genTrack(seed, mode);
  const s = createRun(mode);
  const rng = makeRng(((seed >>> 0) ^ (botOpts.skillSeed ?? 0x1234)) >>> 0);
  const dt = 1 / 60;
  const stepCap = Math.ceil((maxDistance(mode) / mode.vMin + 30) / dt); // generous backstop

  let steps = 0;
  while (s.alive && steps < stepCap) {
    const input = decide(s, mode, track, opts, rng);
    stepRun(s, mode, track, input, dt);
    steps++;
  }
  return {
    distance: s.x,
    time: s.time,
    cause: s.cause,
    motes: s.motes,
    near: s.nearMisses,
    hits: s.hits,
    gates: s.gates,
    gatesMissed: s.gatesMissed,
    endM: s.m,
  };
}

/** A perfect-line reference for the results screen: best-effort mixed bot on a seed. */
export function benchmarkDistance(seed: number, mode: Mode): number {
  return runBot(seed, mode, { policy: 'mixed', missP: 0, skillSeed: 0xbeef }).distance;
}
