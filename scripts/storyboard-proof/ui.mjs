#!/usr/bin/env node
/** Real Chromium interactions with production components and an explicitly local fixture bridge.
 * No Electron launch, user project, API key, package installation or external connection.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from '@remotion/renderer';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { contrastRatio } from '../../src/shared/palette-contrast.ts';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const executable =
  process.env.STORYBOARD_PROOF_BROWSER ??
  join(
    repo,
    'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe',
  );
if (!existsSync(executable))
  throw new Error('Installed local Chromium is required; this runner will not download one.');
const output = mkdtempSync(join(tmpdir(), 'batchclip-storyboard-ui-'));
const evidence = {
  output,
  scope:
    'Production React controls; authored source/project and desktop bridge fixtures, not native Electron or screen-reader certification.',
  screenshots: [],
  checks: [],
  consoleErrors: [],
  unverified: [
    'Native Windows screen reader',
    'Packaged Electron media handles',
    'Native zoom UI',
    'Forced colors',
    'Other host GPUs/platforms',
  ],
};
let server;
let browser;
let page;
const started = performance.now();
const check = (label, condition) => {
  assert.ok(condition, label);
  evidence.checks.push(label);
};
const settle = async () => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // Capture completed finite transitions, never wait for a pending spinner's infinite loop.
    const finite = document
      .getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    let timer;
    try {
      await Promise.race([
        Promise.all(finite.map((animation) => animation.finished.catch(() => undefined))),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('UI animations did not settle')), 3000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
};
async function waitForSelector(selector, { hidden = false, timeout = 45_000 } = {}) {
  await page.evaluate(
    ({ selector, hidden, timeout }) =>
      new Promise((resolve, reject) => {
        let frame;
        const timer = setTimeout(() => {
          cancelAnimationFrame(frame);
          reject(new Error(`Timed out waiting for ${selector}`));
        }, timeout);
        const inspect = () => {
          const element = document.querySelector(selector);
          if (hidden ? !element : Boolean(element)) {
            clearTimeout(timer);
            resolve(true);
          } else frame = requestAnimationFrame(inspect);
        };
        inspect();
      }),
    { selector, hidden, timeout },
  );
}
async function load(
  route,
  { width = 900, height = 640, theme = 'light', query = '', reduced = false, zoom = 1 } = {},
) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page._client().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }],
  });
  await page.goto({
    url: `${server.resolvedUrls.local[0]}scripts/storyboard-proof/ui.html?route=${route}${query}`,
    timeout: 45_000,
  });
  await waitForSelector('button', { timeout: 45_000 });
  await page.evaluate(
    (options) => {
      document.documentElement.classList.toggle('dark', options.theme === 'dark');
      document.documentElement.style.zoom = String(options.zoom);
    },
    { theme, zoom },
  );
  await settle();
}
async function shot(name) {
  await settle();
  const { value } = await page
    ._client()
    .send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const bytes = Buffer.from(value.data, 'base64');
  const path = join(output, `${name}.png`);
  writeFileSync(path, bytes, { flag: 'wx' });
  evidence.screenshots.push({
    name,
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
async function button(label, exact = false) {
  return await page.evaluate(
    async ({ label, exact }) => {
      const candidates = Array.from(document.querySelectorAll('button, summary'));
      const element = candidates.find((candidate) => {
        const text = (candidate.getAttribute('aria-label') || candidate.textContent || '')
          .trim()
          .replace(/\s+/g, ' ');
        return exact ? text === label : text.includes(label);
      });
      if (!element) throw new Error(`Button not found: ${label}`);
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        disabled: 'disabled' in element ? element.disabled : false,
        hit: hit?.outerHTML.slice(0, 600),
        hitExpectedControl: Boolean(hit && element.contains(hit)),
      };
    },
    { label, exact },
  );
}
async function click(label, exact = false) {
  const position = await button(label, exact);
  evidence.lastClick = { label, ...position };
  assert.equal(position.disabled, false, `${label} must be enabled`);
  assert.equal(
    position.hitExpectedControl,
    true,
    `${label} must be visible and receive the pointer`,
  );
  await page
    ._client()
    .send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: position.x, y: position.y });
  await page._client().send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: position.x,
    y: position.y,
    button: 'left',
    clickCount: 1,
  });
  await page._client().send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: position.x,
    y: position.y,
    button: 'left',
    clickCount: 1,
  });
  await settle();
}
async function key(key, code, virtual) {
  await page._client().send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: virtual,
    nativeVirtualKeyCode: virtual,
  });
  await page._client().send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: virtual,
    nativeVirtualKeyCode: virtual,
  });
  await settle();
}
async function pickerContrast(theme) {
  const colors = await page.evaluate(() => {
    const legend = document.querySelector('legend');
    const muted = document.querySelector('fieldset p');
    const selected = document.querySelector('button[aria-pressed="true"]');
    if (!legend || !muted || !selected) throw new Error('Missing picker contrast targets');
    const selectedStyle = getComputedStyle(selected);
    if (selectedStyle.boxShadow === 'none') throw new Error('Missing selected picker ring');
    const probe = document.createElement('span');
    probe.style.position = 'fixed';
    probe.style.color = selectedStyle.getPropertyValue('--tw-ring-color');
    document.body.appendChild(probe);
    try {
      return {
        background: getComputedStyle(document.body).backgroundColor,
        heading: getComputedStyle(legend).color,
        muted: getComputedStyle(muted).color,
        selectedRing: getComputedStyle(probe).color,
      };
    } finally {
      probe.remove();
    }
  });
  const hex = (color) => {
    const channels = color.match(/[\d.]+/g)?.map(Number);
    assert.ok(
      channels && (channels.length === 3 || (channels.length === 4 && channels[3] === 1)),
      `Contrast sampling requires opaque RGB: ${color}`,
    );
    return `#${channels
      .slice(0, 3)
      .map((value) => Math.round(value).toString(16).padStart(2, '0'))
      .join('')}`;
  };
  const background = hex(colors.background);
  const ratios = Object.fromEntries(
    Object.entries(colors)
      .filter(([key]) => key !== 'background')
      .map(([key, color]) => [key, contrastRatio(hex(color), background)]),
  );
  evidence.contrast ??= [];
  evidence.contrast.push({
    theme,
    colors,
    ratios,
    scope: 'Picker text and selected ring on the flat UI canvas, not all app surfaces',
  });
  check(
    `${theme}: picker heading and helper text contrast`,
    ratios.heading >= 4.5 && ratios.muted >= 4.5,
  );
  check(`${theme}: selected ring contrast`, ratios.selectedRing >= 3);
}
async function noHorizontalOverflow(name) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    canvases: document.querySelectorAll('canvas').length,
    autoplay: document.querySelectorAll('video[autoplay]').length,
  }));
  check(`${name}: no page horizontal overflow`, metrics.scroll <= metrics.width + 1);
  check(`${name}: no picker WebGL or autoplay`, metrics.canvases === 0 && metrics.autoplay === 0);
}
try {
  server = await createServer({
    configFile: false,
    root: repo,
    plugins: [react()],
    resolve: {
      alias: { '@': join(repo, 'src/renderer/src'), '@shared': join(repo, 'src/shared') },
    },
    server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { entries: ['scripts/storyboard-proof/ui-entry.tsx'] },
  });
  await server.listen();
  const response = await fetch(`${server.resolvedUrls.local[0]}scripts/storyboard-proof/ui.html`);
  assert.equal(response.status, 200, 'Local verification server readiness');
  console.log(`UI verification ready: ${server.resolvedUrls.local[0]}`);
  browser = await openBrowser('chrome', {
    browserExecutable: executable,
    logLevel: 'error',
    chromiumOptions: { disableWebSecurity: false },
    onBrowserDownload: () => {
      throw new Error('Downloads are forbidden');
    },
  });
  page = await browser.newPage({
    context: () => null,
    logLevel: 'error',
    indent: false,
    pageIndex: 0,
    onBrowserLog: null,
    onLog: () => {},
  });
  page.on('error', (error) => evidence.consoleErrors.push(String(error)));
  await load('appearance', { width: 1280, height: 800 });
  await noHorizontalOverflow('desktop appearance');
  await shot('appearance-light-desktop');
  const accessibility = await page._client().send('Accessibility.getFullAXTree');
  check(
    'Browser accessibility tree names both style buttons',
    ['Ink', 'Polish'].every((name) =>
      accessibility.value.nodes.some(
        (node) => node.role?.value === 'button' && node.name?.value === name,
      ),
    ),
  );
  await key('Tab', 'Tab', 9);
  check(
    'Keyboard focus is visibly distinct',
    await page.evaluate(() => document.activeElement?.matches(':focus-visible')),
  );
  // Native Tab finds Ink; native Space selects it. No synthetic DOM click.
  for (let count = 0; count < 30; count++) {
    if (
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label')?.includes('Ink') ||
          document.activeElement?.textContent?.includes('Ink'),
      )
    )
      break;
    await key('Tab', 'Tab', 9);
  }
  await key(' ', 'Space', 32);
  check(
    'Keyboard selects Ink',
    (await page.evaluate(() => window.storyboardUI.state())).style === 'ink',
  );
  await shot('appearance-keyboard-ink');
  await click('Polish');
  check(
    'Pointer selects Polish without a keyboard focus ring',
    await page.evaluate(
      () =>
        window.storyboardUI.state().style === 'polish' &&
        !document.activeElement?.matches(':focus-visible'),
    ),
  );
  for (const theme of ['light', 'dark']) {
    await load('appearance', { theme });
    await pickerContrast(theme);
    await load('dialog', { theme });
    await noHorizontalOverflow(`${theme} dialog minimum`);
    await shot(`dialog-${theme}-900x640`);
    await click('Ink');
    await shot(`dialog-${theme}-appearance-selected`);
    await click('Cancel', true);
    check(
      `${theme}: cancelling draft leaves saved selection unchanged`,
      (await page.evaluate(() => window.storyboardUI.state())).style === 'polish',
    );
    await load('drop', { theme });
    await noHorizontalOverflow(`${theme} prestart minimum`);
    await shot(`drop-${theme}-900x640`);
    await load('review', { theme });
    await noHorizontalOverflow(`${theme} review minimum`);
    await shot(`review-${theme}-900x640`);
    await click('Edit', true);
    check(
      `${theme}: board editor permits only full frame`,
      await page.evaluate(() => {
        const select = document.querySelector('[role="dialog"] select');
        return select?.disabled && select.options.length === 1 && select.value === 'full-frame';
      }),
    );
    await shot(`review-${theme}-board-editor`);
    await key('Escape', 'Escape', 27);
    await waitForSelector('[role="dialog"]', { hidden: true, timeout: 5_000 });
    check(
      `${theme}: Escape restores editor focus`,
      await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Edit'),
    );
  }
  for (const width of [320, 390]) {
    await load('appearance', { width, height: 900 });
    await page.evaluate(() => window.storyboardUI.setLongName());
    await settle();
    await noHorizontalOverflow(`${width}px long palette`);
    await shot(`appearance-${width}-long-name`);
    for (const route of ['drop', 'dialog', 'review']) {
      await load(route, { width, height: 900 });
      await noHorizontalOverflow(`${width}px ${route}`);
      await shot(`${route}-${width}-reflow`);
    }
  }
  await load('appearance', { width: 900, height: 640, zoom: 2, reduced: true });
  await noHorizontalOverflow('200percent CSS zoom / reduced motion');
  check(
    'Reduced motion media is active',
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
  );
  await shot('appearance-200percent-reduced-motion');
  await load('dialog', { query: '&missing=1' });
  check('Missing palette blocks generation', (await button('Create project and process')).disabled);
  await shot('dialog-missing-palette');
  await load('dialog', { query: '&busy=1' });
  check('Pending creation disables storyboard controls', (await button('Ink')).disabled);
  await shot('dialog-disabled-pending');
  await load('review');
  await click('Plan settings, history and feedback');
  await click('Change style and palette');
  await click('Ink');
  const revised = await page.evaluate(() => window.storyboardUI.state());
  check(
    'Style revision creates an unapproved draft',
    revised.planStyle === 'ink' &&
      revised.status === 'draft' &&
      revised.versions >= 2 &&
      !revised.approved,
  );
  check(
    'Style revision makes no AI call',
    await page.evaluate(
      () => !window.storyboardUI.calls.some((name) => /generate|gemini/i.test(name)),
    ),
  );
  await shot('review-style-draft');
  await click('Compare and restore');
  await click('Restore earlier version');
  await waitForSelector('[role="dialog"]', { hidden: true, timeout: 5_000 });
  const restored = await page.evaluate(() => window.storyboardUI.state());
  check(
    'History restores saved style as an unapproved draft',
    restored.planStyle === 'polish' && restored.status === 'draft' && !restored.approved,
  );
  await shot('review-restored-history');
  await click('Plan settings, history and feedback');
  await click('Render draft preview');
  await shot('review-preview-pending');
  await click('Cancel preview');
  check(
    'Cancel reaches the desktop bridge',
    await page.evaluate(() => window.storyboardUI.calls.includes('cancelLongformScenePreview')),
  );
  await page.evaluate(() => window.storyboardUI.setPreviewMode('failure'));
  await click('Render draft preview');
  await settle();
  check('Preview failure exposes Retry', !(await button('Retry draft preview')).disabled);
  await shot('review-preview-failure-retry');
  await page.evaluate(() => window.storyboardUI.makeStale());
  await settle();
  await shot('review-stale-source');
  assert.deepEqual(evidence.consoleErrors, [], 'Unexpected browser JavaScript errors');
  evidence.status = 'pass';
} catch (error) {
  evidence.status = 'fail';
  evidence.error = error instanceof Error ? error.stack : String(error);
  if (page) {
    try {
      evidence.failureState = await page.evaluate(() => window.storyboardUI?.state());
      await shot('failure');
    } catch {
      /* Keep original failure when capture is unavailable. */
    }
  }
  throw error;
} finally {
  evidence.wallTimeMs = Math.round(performance.now() - started);
  writeFileSync(join(output, 'report.json'), JSON.stringify(evidence, null, 2));
  console.log(`UI evidence: ${join(output, 'report.json')}`);
  await browser?.close({ silent: true });
  await server?.close();
}
