/**
 * source-hygiene.test.ts — no literal control bytes in source files.
 *
 * A control character typed straight into a source file compiles and runs fine —
 * and then `file` reports the source as "data", `git` treats it as binary, `diff`
 * refuses it, and plain `grep` SILENTLY MATCHES NOTHING in it, so an audit that greps
 * gets an all-clear it did not earn. Write the escape SEQUENCE (\x00) instead. Also
 * guards: no console noise, and no analytics beyond the one mandated beacon.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|css|html|json|webmanifest)$/.test(name)) out.push(path);
  }
  return out;
}

/** Tab, newline and carriage return are the only control bytes text may hold. */
function controlBytes(buf: Buffer): number[] {
  const at: number[] = [];
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || c === 127) at.push(i);
  }
  return at;
}

describe('source hygiene', () => {
  it('has no literal control bytes in src/ or tests/', () => {
    const offenders: string[] = [];
    for (const path of [...sourceFiles('src'), ...sourceFiles('tests')]) {
      const at = controlBytes(readFileSync(path));
      if (at.length) offenders.push(`${path} (${at.length} at offset ${at[0]})`);
    }
    expect(offenders, 'write \\x00-style escapes instead of raw control bytes').toEqual([]);
  });

  it('ships no console.log / console.error', () => {
    const offenders = sourceFiles('src').filter((p) =>
      /\bconsole\.(log|error|warn|debug|info)\s*\(/.test(readFileSync(p, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('adds no analytics beyond the one mandated beacon', () => {
    const html = readFileSync('index.html', 'utf8');
    const beacons = (html.match(/<script[^>]*src="https?:\/\/[^"]+"/g) ?? []).filter((s) => !s.includes('feedback.benrichardson.dev'));
    expect(beacons).toHaveLength(1);
    expect(beacons[0]).toContain('static.cloudflareinsights.com');
    for (const bad of ['google-analytics', 'googletagmanager', 'plausible', 'segment', 'hotjar']) {
      expect(html).not.toContain(bad);
    }
  });

  it('loads no third-party fonts or CDN assets', () => {
    const files = [...sourceFiles('src'), 'index.html'];
    for (const path of files) {
      const src = readFileSync(path, 'utf8');
      expect(src, `${path} pulls a font from the network`).not.toMatch(/fonts\.(googleapis|gstatic)/);
      expect(src, `${path} imports from a CDN`).not.toMatch(/@import\s+url\(["']?https?:/);
    }
  });

  it('keeps the [hidden] guard that stops an invisible overlay eating taps', () => {
    expect(existsSync('src/styles/mobile.css'), 'mobile.css is where the guard lives').toBe(true);
    const css = readFileSync('src/styles/mobile.css', 'utf8');
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  it('stacks the attribution footer ABOVE the menu/results screens', () => {
    // The footer is fixed at the bottom while .screen is a full-bleed fixed overlay
    // with its own background. Ship the footer below it and the backlink is invisible
    // on every screen — which is exactly what happened before this guard.
    const css = readFileSync('src/styles/main.css', 'utf8');
    const zOf = (sel: string): number => {
      const block = new RegExp(`${sel}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';
      return Number.parseInt(/z-index:\s*(\d+)/.exec(block)?.[1] ?? '-1', 10);
    };
    const footer = zOf('\\.site-footer');
    const screen = zOf('\\.screen');
    expect(screen).toBeGreaterThan(0);
    expect(footer).toBeGreaterThan(screen);
    // …and still hidden mid-run, so it never steals play area.
    const mobile = readFileSync('src/styles/mobile.css', 'utf8');
    expect(mobile).toMatch(/body\.playing\s+\.site-footer\s*\{\s*display:\s*none\s*!important/);
  });
});
