// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * daily.ts — the async-multiplayer surface: a worldwide daily seed everyone runs,
 * and share links that carry an exact (seed, mode) so a friend runs the same bridge.
 *
 * `Date` lives here, not in the sim — this module only PICKS a seed; the track and
 * physics that seed drives stay a pure function of it (see game.ts).
 */

import { hashSeed } from './engine/rng';
import { modeOf, DEFAULT_MODE, type Mode } from './modes';

export function todayKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Everyone in the world gets the same track for a given UTC day. */
export function dailySeed(d = new Date()): number {
  return hashSeed(`emberwake-daily-${todayKey(d)}`) >>> 0;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export interface ShareTarget {
  seed: number;
  mode: Mode;
  /** the sharer's distance, if present — shown as the bar to beat. */
  beat: number | null;
}

/** Read a ?seed=&mode=&d= share link (consumed once, then cleared). */
export function parseShare(search = window.location.search): ShareTarget | null {
  const p = new URLSearchParams(search);
  const rawSeed = p.get('seed');
  if (rawSeed == null) return null;
  const seed = Number.parseInt(rawSeed, 10);
  if (!Number.isFinite(seed)) return null;
  const mode = modeOf(p.get('mode') ?? DEFAULT_MODE);
  const d = p.get('d');
  const beat = d != null && Number.isFinite(Number.parseInt(d, 10)) ? Number.parseInt(d, 10) : null;
  return { seed: seed >>> 0, mode, beat };
}

export function buildShareUrl(seed: number, modeId: string, distance: number): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  const q = new URLSearchParams({ seed: String(seed >>> 0), mode: modeId, d: String(Math.round(distance)) });
  return `${base}?${q.toString()}`;
}

/** Strip the share params so a reload / home-screen relaunch starts fresh. */
export function clearShareInUrl(): void {
  const url = new URL(window.location.href);
  if (!url.search) return;
  url.search = '';
  window.history.replaceState({}, '', url.toString());
}
