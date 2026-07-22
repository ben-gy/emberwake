# Emberwake

**Outrun the dark — your momentum is your speed, your life and your score all at once.**

🎮 Play: https://emberwake.benrichardson.dev

## What it is

An auto-running spark tears up a lane track while a wall of dark rises behind it,
accelerating the further you go. You swipe to change lane, leap pits, slide under
overhangs and grab light-motes — and you hold **SURGE** to dump stored momentum into a
burst that clears otherwise-impossible chasms.

The hook is that **momentum is your speed, your health and your score at once**. Clipping
a hazard doesn't kill you — it bleeds momentum, so you slow down, and the dark closes.
Threading hairline near-misses (jumping a pit while standing in its lane, sliding under a
bar rather than dodging around it) and collecting motes tops it back up. The instant the
dark catches you, you're unmade.

That single rule makes every hazard a real decision. Sidestepping into an empty lane is
always safe and always pays nothing; threading the hazard in-lane pays the momentum you'll
need to afford the next chasm and stay ahead of an ever-faster dark. Every run is banking
clean racing lines and deciding when to blow the bank on a surge.

There's no winning — the dark's floor speed rises with distance and eventually outruns
your top speed, so every run is bounded. It's *how far* that counts.

## How to play

- **Mobile:** swipe left/right to switch lane, up to leap a pit, down to slide under a
  bar. Hold the **SURGE** pad to burst across the glowing chasms.
- **Desktop:** ← → / A D to switch lane, ↑ / W to jump, ↓ / S to slide, hold **Space** or
  **Shift** to surge.

Grab motes and thread hazards to keep momentum up. Chasms are only crossable while
surging — and surging spends the very momentum that keeps you ahead, so pick your moment.

## Modes

Three tracks that genuinely play differently, not three difficulty dials:

| Mode | Shape |
|------|-------|
| **Ember** | 3 lanes, balanced hazard mix, moderate dark ramp. The line to learn. |
| **Nightfall** | 3 lanes, the dark starts close and gains fast, fewer motes, more chasms — a momentum-management pressure cooker. |
| **Latticework** | 5 lanes, denser hazards and more chasms but a gentler dark — a spatial routing puzzle, and the longest runs. |

## Multiplayer

**Async seed-share** — no live connection, no server, no lobby.

Every track is a pure function of its seed, so **Today's run** gives everyone on Earth the
identical bridge for that UTC day, and **Share this run** produces a link carrying the exact
seed, mode and your distance so a friend runs the same track and can see the number to
beat. Replay a seed you've run before and a translucent **ghost of your own best run** on
that track races alongside you.

The results screen also shows what a clean line actually reaches on your exact seed (a
deterministic bot's run), so you always know how much was left on the table.

## Tech

- Vite 6 + vanilla TypeScript
- Canvas 2D rendering, fixed-timestep simulation (60Hz)
- Shared engine from the factory's `patterns/`: fixed-timestep loop, seeded PRNG,
  procedural audio, quota-safe storage, mobile viewport hardening
- Vitest for the sim, determinism, fairness invariants and the balance sim
- GitHub Pages hosting

The whole simulation is deterministic — a pure function of (seed, mode, input sequence) —
which is what makes the daily seed, share links, the ghost replay and the balance bot all
agree byte-for-byte.

### Balance

The difficulty curve is the opponent here, so it's measured rather than argued
(`tests/balance.test.ts`). A reactive runner-bot plays hundreds of fixed seeds per mode
under three surge policies, asserting that a mixed "spend at chasms and to escape the
closing dark" line beats both pure-hoarding (never surge → dies at the first chasm) and
surge-spam (bleeds momentum → caught early) — by 3–4× and 5–7× respectively — that unfair
early deaths are ~zero, and that run length lands in a sane window. The sim overruled the
design's first two tunings; see the build log.

No cookies, no fingerprinting, no third-party fonts. Anonymous, cookie-less page-view
counts via Cloudflare Web Analytics.

## Local dev

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

## license

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see
[ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

In short: you may run, modify, redistribute and even sell this, but if you
distribute it — or run a modified version where other people can reach it — you
have to publish your source under the same licence and keep the attribution. A
separate commercial licence without those obligations is available on request:
<hi@ben.gy>.

Third-party components keep their own licences — see
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
