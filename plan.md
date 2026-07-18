# Game Plan: Emberwake

## Overview
- **Name:** Emberwake
- **Repo name:** emberwake
- **Tagline:** Outrun the dark — your momentum is your speed, your life and your score all at once.
- **Genre (directory category):** arcade

## Core Loop
An auto-running spark sprints up a lane track while a wall of dark rises behind it,
accelerating the further you go. You **swipe** to change lane, leap pits, slide under
overhangs and grab light-motes — and you **hold SURGE** to dump stored momentum into a
burst that clears otherwise-impossible chasms. The hook: **momentum IS your speed, your
health and your score at once.** Clipping a hazard doesn't kill you outright — it bleeds
momentum, so you slow, and the dark closes. Threading hairline near-misses and grabbing
motes tops it back up. The instant the dark catches you, you're unmade. Every run is
banking clean lines and deciding when to blow the bank on a surge.

- **Win:** none — endless score-attack; further = better. The dark's floor speed rises
  with distance and eventually exceeds your top speed, so every run is bounded; skill
  (momentum upkeep) decides *how far*.
- **Lose:** the dark's edge reaches you (gap ≤ 0), or you fall into an un-surged chasm.
- **Tension:** every hazard is a choice — safe-dodge to another lane for nothing, or
  thread it in-lane (jump the pit / slide the low) for a momentum refill you'll need to
  afford the next chasm and stay ahead of the accelerating dark.

## Controls
- **Desktop:** ←/→ or A/D change lane · ↑/W jump · ↓/S slide · hold Space/Shift = SURGE.
- **Mobile:** swipe left/right/up/down anywhere on the play field (≥50px, >0.5px/ms,
  <250ms, dominant-axis lock) · hold a large thumb-reachable **SURGE** pad (bottom-centre,
  safe-area inset). No D-pad, no reach-across — swipes + one hold pad fit the hand.

## Multiplayer
- **Mode:** async-seed (share a board, compare scores). No live P2P.
- **Why not live:** Emberwake is a score-attack whose soul is solo. The idea's "ghost
  race" is a *parallel time-trial* — each runner sims only itself on the same seeded
  track, nothing is shared or authoritative, so there is nothing to desync. Its natural,
  robust expression is async: a **daily worldwide seed** (identical track for everyone →
  async global comparison), **share links** carrying `?seed=&mode=` so a friend runs the
  exact same bridge, and a **ghost of your own best run** on that track (recorded pose
  samples, replayed translucent) since the sim is fully deterministic. This avoids the
  entire live-P2P contract for zero loss of the core experience.
- **Everyone's result:** the results screen shows your distance, your ghost/best, the
  seed's known "clean line" benchmark (a bot's deterministic run on your exact seed) and
  what you left on the table (motes missed, chasms fumbled).

## Juice Plan
- **Sound (sound.ts patches):** mote grab (coin), jump, slide (blip), near-miss thread
  (select), hazard clip (hit + shake), surge whoosh (powerup), chasm cross (win-ish),
  death (lose), plus a rising heartbeat when the gap is small.
- **Particles:** ember trail behind the runner (momentum-scaled), mote sparkle burst,
  hit debris, surge speed-lines / after-image.
- **Screen:** shake on clip & chasm land (reduced-motion → none), red vignette + pulse as
  the dark closes, chromatic warm→cold shift as momentum drops, dark creeping mask.
- **Tweens:** lane slide (120ms ease), jump arc, slide squash, momentum-bar spring.
- **Palette:** void bg, amber ember, cyan motes, magenta chasms/gates — colour-blind-safe
  (distinct hue + distinct shape), dark = deep indigo/black.

## Style Direction
**Vibe:** neon / minimalist. **Palette:** amber ember, cyan mote, magenta chasm on deep
indigo-black — CVD-safe by hue+shape. **Theme:** dark. **Reference feel:** the clean
neon momentum of a good abstract runner (feel only, no IP).

## Technical Architecture
- **Stack:** vanilla TypeScript + Vite.
- **Render:** Canvas 2D (vertical portrait lane track; runner near the bottom, hazards
  scroll down from the top, the dark rises from below).
- **Engine modules copied from patterns/:** loop (fixed-timestep, determinism), rng
  (seeded track), sound, storage, mobile (+ mobile.css). No net/lobby/rematch (solo).
- **Persistence:** localStorage — best distance per mode, daily best, settings (mute,
  reduced-motion override), first-visit flag, own-best ghost samples per mode.

## Determinism
The whole sim is a pure function of (seed, mode, input sequence), stepped at a fixed 60Hz
via loop.ts. Track events are generated from `makeRng(seed)`. This gives: byte-identical
tracks across the daily seed + share links, a replayable own-best ghost, and a bot the
balance sim can drive over hundreds of seeds.

## Modes (3, genuine spread — each a distinct product surface, verified at 375px)
- **Ember (Classic):** 3 lanes, balanced hazard mix, moderate dark ramp. The default line.
- **Nightfall:** 3 lanes, the dark starts closer and ramps *faster*, fewer motes, more
  chasms → a momentum-management pressure cooker; short, tense runs.
- **Latticework:** 5 lanes, denser blocks/pits and more chasms but a *gentler* dark ramp →
  a spatial routing puzzle; longer runs. (The 5-lane layout is the phone-width risk —
  must fit ~375px with no overflow.)

## Balance (difficulty curve is the opponent — tests/balance.test.ts)
A runner-bot plays hundreds of fixed seeds per mode. Assert: run-length lands in a target
window (not trivially endless, not an instant wall); the **unfair-early-death rate is near
zero** (dying before a floor distance from bad luck is rare — the track is always
survivable by lane-dodging); and a **mixed hoard-and-spend surge policy beats both pure
hoarding and surge-spam** (so skill, not luck or a degenerate strategy, decides the
winner). Levers: dark ramp coefficient, per-hazard drain, near-miss/mote refill, chasm
(gate) spacing & cost. Deterministic, seeded, sub-second.

## Non-Goals
No live P2P, no accounts, no server. No perspective 3D — clean 2D vertical track. No
input-replay netcode; the ghost is a local pose replay only.

## How To Play (player-facing copy)
Swipe to switch lane, jump pits (↑) and slide under bars (↓). Grab motes and thread
hazards to keep your momentum up — it's your speed AND your life. Hold **SURGE** to burst
across the glowing chasms. Don't let the dark catch you.
