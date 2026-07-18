/**
 * ui.ts — builds the DOM shell (menu, HUD, results, modals, footer) and hands main.ts
 * the element refs + small update helpers. No game logic lives here.
 */

import { allModes, type Mode } from './modes';

const SHELL = `
<canvas id="stage"></canvas>

<div class="hud" id="hud" hidden>
  <div class="mbar"><div class="mbar-fill" id="mfill"></div></div>
  <div class="hud-row">
    <div class="hud-left">
      <div class="dist" id="dist">0<span class="unit">m</span></div>
      <div class="best-sm" id="bestSm"></div>
    </div>
    <div class="hud-mid"><span class="chip" id="modeChip">Ember</span></div>
    <div class="hud-right">
      <button class="icon-btn" id="btnMute" aria-label="Mute">🔊</button>
      <button class="icon-btn" id="btnPause" aria-label="Pause">❚❚</button>
    </div>
  </div>
</div>

<div class="control-layer" id="controls" hidden>
  <button class="surge-pad" id="surgePad" aria-label="Surge">SURGE</button>
</div>

<div class="pause-veil" id="pauseVeil" hidden>
  <div class="panel">
    <h2>Paused</h2>
    <button class="btn primary" id="btnResume">Resume</button>
    <button class="btn" id="btnQuit">Back to menu</button>
  </div>
</div>

<section class="screen main-content" id="menu">
  <div class="menu-inner">
    <h1 class="logo">EMBER<span>WAKE</span></h1>
    <p class="tag">Outrun the dark. Your momentum is your speed, your life and your score — all at once.</p>

    <div class="modes" id="modeChips"></div>

    <button class="btn primary big" id="btnPlay">Play</button>
    <button class="btn" id="btnDaily">Today's run <span class="daily-sub" id="dailySub"></span></button>

    <div class="menu-links">
      <button class="link" id="btnHowto">How to play</button>
      <button class="link" id="btnAbout">About</button>
      <button class="link" id="btnMuteMenu">Sound: on</button>
    </div>
  </div>
</section>

<section class="screen main-content" id="over" hidden>
  <div class="menu-inner">
    <div class="over-badge" id="overBadge">UNMADE</div>
    <div class="over-dist" id="overDist">0<span class="unit">m</span></div>
    <div class="over-sub" id="overSub"></div>
    <div class="bench" id="bench"></div>
    <div class="breakdown" id="breakdown"></div>
    <div class="over-actions">
      <button class="btn primary big" id="btnAgain">Run again</button>
      <button class="btn" id="btnShare">Share this run</button>
      <button class="btn" id="btnBackMenu">Menu</button>
    </div>
    <div class="share-msg" id="shareMsg" hidden></div>
  </div>
</section>

<div class="modal" id="howto" hidden>
  <div class="panel">
    <h2>How to play</h2>
    <ul class="how">
      <li><b>Swipe</b> left/right to switch lane, <b>up</b> to leap a pit, <b>down</b> to slide under a bar. Desktop: arrows / WASD.</li>
      <li>Grab <span class="cy">motes</span> and <b>thread</b> hazards in-lane (jump the pit, slide the bar) to top up your <b>momentum</b>.</li>
      <li>Momentum is your speed, your health and your score. Clip a hazard and it bleeds — you slow, and the dark closes.</li>
      <li>Hold <b>SURGE</b> (pad / Space) to burst across the glowing <span class="mg">chasms</span>. It spends momentum, so pick your moment.</li>
      <li>The dark speeds up the further you go. Everyone is caught eventually — it's how far that counts.</li>
    </ul>
    <button class="btn primary" id="btnHowtoClose">Got it</button>
  </div>
</div>

<div class="modal" id="about" hidden>
  <div class="panel">
    <h2>About Emberwake</h2>
    <p>A neon momentum-runner. Every track is generated from a seed, so the <b>daily run</b> and any <b>share link</b> give everyone the exact same bridge — compare how far you got.</p>
    <p>No accounts, no server, no cookies. Anonymous, cookie-less page-view counts via Cloudflare Web Analytics — nothing else leaves your device.</p>
    <p class="fine">Built by <a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a> · <a href="https://hub.benrichardson.dev" target="_blank" rel="noopener">more games, tools &amp; sites</a></p>
    <button class="btn primary" id="btnAboutClose">Close</button>
  </div>
</div>

<footer class="site-footer">
  Built by <a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a>
  · <a href="https://hub.benrichardson.dev" target="_blank" rel="noopener">more games, tools &amp; sites</a>
</footer>
`;

export interface UIRefs {
  canvas: HTMLCanvasElement;
  hud: HTMLElement;
  mfill: HTMLElement;
  dist: HTMLElement;
  bestSm: HTMLElement;
  modeChip: HTMLElement;
  btnMute: HTMLButtonElement;
  btnPause: HTMLButtonElement;
  controls: HTMLElement;
  surgePad: HTMLButtonElement;
  pauseVeil: HTMLElement;
  btnResume: HTMLButtonElement;
  btnQuit: HTMLButtonElement;
  menu: HTMLElement;
  modeChips: HTMLElement;
  btnPlay: HTMLButtonElement;
  btnDaily: HTMLButtonElement;
  dailySub: HTMLElement;
  btnHowto: HTMLButtonElement;
  btnAbout: HTMLButtonElement;
  btnMuteMenu: HTMLButtonElement;
  over: HTMLElement;
  overBadge: HTMLElement;
  overDist: HTMLElement;
  overSub: HTMLElement;
  bench: HTMLElement;
  breakdown: HTMLElement;
  btnAgain: HTMLButtonElement;
  btnShare: HTMLButtonElement;
  btnBackMenu: HTMLButtonElement;
  shareMsg: HTMLElement;
  howto: HTMLElement;
  btnHowtoClose: HTMLButtonElement;
  about: HTMLElement;
  btnAboutClose: HTMLButtonElement;
}

const $ = <T extends HTMLElement>(root: HTMLElement, id: string): T =>
  root.querySelector(`#${id}`) as T;

export function buildUI(root: HTMLElement): UIRefs {
  root.innerHTML = SHELL;
  return {
    canvas: $(root, 'stage'),
    hud: $(root, 'hud'),
    mfill: $(root, 'mfill'),
    dist: $(root, 'dist'),
    bestSm: $(root, 'bestSm'),
    modeChip: $(root, 'modeChip'),
    btnMute: $(root, 'btnMute'),
    btnPause: $(root, 'btnPause'),
    controls: $(root, 'controls'),
    surgePad: $(root, 'surgePad'),
    pauseVeil: $(root, 'pauseVeil'),
    btnResume: $(root, 'btnResume'),
    btnQuit: $(root, 'btnQuit'),
    menu: $(root, 'menu'),
    modeChips: $(root, 'modeChips'),
    btnPlay: $(root, 'btnPlay'),
    btnDaily: $(root, 'btnDaily'),
    dailySub: $(root, 'dailySub'),
    btnHowto: $(root, 'btnHowto'),
    btnAbout: $(root, 'btnAbout'),
    btnMuteMenu: $(root, 'btnMuteMenu'),
    over: $(root, 'over'),
    overBadge: $(root, 'overBadge'),
    overDist: $(root, 'overDist'),
    overSub: $(root, 'overSub'),
    bench: $(root, 'bench'),
    breakdown: $(root, 'breakdown'),
    btnAgain: $(root, 'btnAgain'),
    btnShare: $(root, 'btnShare'),
    btnBackMenu: $(root, 'btnBackMenu'),
    shareMsg: $(root, 'shareMsg'),
    howto: $(root, 'howto'),
    btnHowtoClose: $(root, 'btnHowtoClose'),
    about: $(root, 'about'),
    btnAboutClose: $(root, 'btnAboutClose'),
  };
}

/** Build the three mode chips; returns them so main can wire selection. */
export function buildModeChips(
  container: HTMLElement,
  selected: string,
  onSelect: (m: Mode) => void,
): void {
  container.innerHTML = '';
  for (const m of allModes()) {
    const chip = document.createElement('button');
    chip.className = 'mode-chip' + (m.id === selected ? ' on' : '');
    chip.dataset.mode = m.id;
    chip.innerHTML = `<span class="mc-name">${m.name}</span><span class="mc-blurb">${m.blurb}</span>`;
    chip.addEventListener('click', () => onSelect(m));
    container.appendChild(chip);
  }
}

export function highlightMode(container: HTMLElement, modeId: string): void {
  for (const el of Array.from(container.children)) {
    el.classList.toggle('on', (el as HTMLElement).dataset.mode === modeId);
  }
}

/** momentum → warm colour high, cold/red low. */
export function momentumColor(m: number): string {
  const hue = 8 + m * 42; // 8 (red) → 50 (amber)
  const light = 44 + m * 14;
  return `hsl(${hue} 100% ${light}%)`;
}
