// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * modes.ts — the three genuinely-different tracks.
 *
 * A mode is a full parameter set, not a dial: lane COUNT, the dark's floor speed
 * and ramp, the momentum economy, and the track generator's density all change,
 * so Ember, Nightfall and Latticework play differently (see plan.md §Modes).
 * The numbers here are the balance levers — tests/balance.test.ts referees them.
 *
 * Guard untrusted ids with Object.hasOwn so a share link carrying `?mode=constructor`
 * can never resolve to a Mode of undefined fields (a prototype-key leak).
 */

export type EventKind = 'block' | 'pit' | 'low' | 'mote' | 'gate';

export interface Mode {
  id: string;
  name: string;
  blurb: string;
  lanes: number;

  /** forward speed = vMin + momentum*(vMax-vMin) (m/s). */
  vMin: number;
  vMax: number;

  /** the dark's floor speed = darkBase + darkRamp*distance (m/s). Rises forever. */
  darkBase: number;
  darkRamp: number;
  /** starting lead over the dark, and the cap on how much lead can be banked. */
  gap0: number;
  gapMax: number;

  /** momentum economy — all in momentum units [0,1]. */
  mStart: number;
  /** passive momentum bleed per second — the spark cooling. Forces upkeep, so a
   *  run is never a free cruise to the ramp wall; you slow unless you keep feeding. */
  mDecay: number;
  drainBlock: number;
  drainPit: number;
  drainLow: number;
  refillMote: number;
  refillNear: number;
  surgeBoost: number; // m/s added while surging
  surgeDrain: number; // momentum/sec spent while surging
  gateCost: number; // momentum spent to cross a chasm

  /** track generation. */
  firstEventAt: number;
  baseSpacing: number;
  minSpacing: number;
  tightenOver: number;
  jitter: number;
  moteChance: number;
  gateEvery: number;
}

const MODES: Record<string, Mode> = {
  ember: {
    id: 'ember',
    name: 'Ember',
    blurb: '3 lanes · a balanced run. Learn the line.',
    lanes: 3,
    vMin: 13,
    vMax: 27,
    darkBase: 15,
    darkRamp: 0.0072,
    gap0: 60,
    gapMax: 95,
    mStart: 0.7,
    mDecay: 0.012,
    drainBlock: 0.34,
    drainPit: 0.4,
    drainLow: 0.34,
    refillMote: 0.11,
    refillNear: 0.09,
    surgeBoost: 12,
    surgeDrain: 0.5,
    gateCost: 0.16,
    firstEventAt: 140,
    baseSpacing: 44,
    minSpacing: 16,
    tightenOver: 1800,
    jitter: 0.28,
    moteChance: 0.34,
    gateEvery: 340,
  },
  nightfall: {
    id: 'nightfall',
    name: 'Nightfall',
    blurb: '3 lanes · the dark starts close and gains fast. Manage every ember.',
    lanes: 3,
    vMin: 13,
    vMax: 27,
    darkBase: 17,
    darkRamp: 0.0085,
    gap0: 46,
    gapMax: 74,
    mStart: 0.64,
    mDecay: 0.015,
    drainBlock: 0.36,
    drainPit: 0.42,
    drainLow: 0.36,
    refillMote: 0.115,
    refillNear: 0.092,
    surgeBoost: 12,
    surgeDrain: 0.55,
    gateCost: 0.15,
    firstEventAt: 120,
    baseSpacing: 42,
    minSpacing: 15,
    tightenOver: 1100,
    jitter: 0.3,
    moteChance: 0.3,
    gateEvery: 300,
  },
  latticework: {
    id: 'latticework',
    name: 'Latticework',
    blurb: '5 lanes · denser hazards, gentler dark. A routing puzzle.',
    lanes: 5,
    vMin: 13,
    vMax: 28,
    darkBase: 14,
    darkRamp: 0.0062,
    gap0: 66,
    gapMax: 108,
    mStart: 0.7,
    mDecay: 0.01,
    drainBlock: 0.32,
    drainPit: 0.38,
    drainLow: 0.32,
    refillMote: 0.105,
    refillNear: 0.088,
    surgeBoost: 12,
    surgeDrain: 0.5,
    gateCost: 0.15,
    firstEventAt: 150,
    baseSpacing: 40,
    minSpacing: 14,
    tightenOver: 2600,
    jitter: 0.26,
    moteChance: 0.34,
    gateEvery: 400,
  },
};

export const MODE_IDS = Object.keys(MODES);
export const DEFAULT_MODE = 'ember';

/** Validate an id off the wire / URL; unknown → default, never `undefined`. */
export function modeOf(id: string | null | undefined): Mode {
  if (id && Object.hasOwn(MODES, id)) return MODES[id];
  return MODES[DEFAULT_MODE];
}

export function allModes(): Mode[] {
  return MODE_IDS.map((id) => MODES[id]);
}
