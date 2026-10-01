import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const readProjectFile = (path: string): string => readFileSync(resolve(root, path), 'utf8');

function readSourceTree(path: string): string {
  const absolute = resolve(root, path);
  return readdirSync(absolute)
    .map((entry) => {
      const child = resolve(absolute, entry);
      if (statSync(child).isDirectory()) return readSourceTree(`${path}/${entry}`);
      return /\.(?:css|tsx?)$/.test(entry) ? readFileSync(child, 'utf8') : '';
    })
    .join('\n');
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function rgb({ h, s, l }: Hsl): [number, number, number] {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = h / 60;
  const component = chroma * (1 - Math.abs((section % 2) - 1));
  let channels: [number, number, number];
  if (section < 1) channels = [chroma, component, 0];
  else if (section < 2) channels = [component, chroma, 0];
  else if (section < 3) channels = [0, chroma, component];
  else if (section < 4) channels = [0, component, chroma];
  else if (section < 5) channels = [component, 0, chroma];
  else channels = [chroma, 0, component];
  const offset = lightness - chroma / 2;
  return channels.map((channel) => channel + offset) as [number, number, number];
}

function luminance(color: Hsl): number {
  const [red, green, blue] = rgb(color).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: Hsl, background: Hsl): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const lightBackground = { h: 36, s: 35, l: 96 };
const darkBackground = { h: 10.4, s: 48.9, l: 9.2 };

describe('QA-05 through QA-10 release contracts', () => {
  it('keeps the production window adaptive and preserves native platform chrome', () => {
    const main = readProjectFile('src/main/index.ts');
    const settings = readProjectFile('src/main/settings-window.ts');
    const preload = readProjectFile('src/preload/index.ts');

    expect(main).toContain('const MIN_WIDTH = 900;');
    expect(main).toContain("titleBarStyle: 'hiddenInset'");
    expect(main).toContain('trafficLightPosition');
    expect(main).toContain("autoHideMenuBar: process.platform === 'darwin'");
    expect(settings).toContain('const MIN_WIDTH = 400;');
    expect(preload).toContain('webFrame.setZoomFactor(factor)');
  });

  it('ships macOS and Windows associations, installer surfaces, and update metadata', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      build: {
        fileAssociations: Array<{ ext: string; role: string }>;
        win: { target: Array<{ target: string; arch: string[] }> };
        mac: { target: Array<{ target: string; arch: string[] }> };
        publish: { provider: string };
        nsis: { perMachine: boolean; allowElevation: boolean; packElevateHelper: boolean };
      };
    };

    expect(packageJson.build.fileAssociations).toContainEqual(
      expect.objectContaining({ ext: 'batchclip', role: 'Editor' }),
    );
    expect(packageJson.build.win.target).toContainEqual({ target: 'nsis', arch: ['x64'] });
    expect(packageJson.build.mac.target).toContainEqual({ target: 'dmg', arch: ['arm64'] });
    expect(packageJson.build.publish.provider).toBe('github');
    expect(packageJson.build.nsis).toMatchObject({
      perMachine: false,
      allowElevation: false,
      packElevateHelper: false,
    });
  });

  it('provides reduced-motion, forced-color, and visible-focus paths without transition-all', () => {
    const css = readProjectFile('src/renderer/src/assets/index.css');
    const renderer = readSourceTree('src/renderer/src');

    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('outline: 3px solid Highlight');
    expect(css).toContain('.qa-reduced-motion');
    expect(css).toContain('.qa-forced-colors');
    expect(renderer).not.toMatch(/transition\s*:\s*all\b/);
    expect(renderer).not.toContain('transition-all');
  });

  it('measures every theme text pair above WCAG AA', () => {
    const css = readProjectFile('src/renderer/src/assets/index.css');
    expect(css).toContain('--muted-foreground: 24 12% 38%');
    expect(css).toContain('--muted-foreground: 35 31% 72%');

    const pairs = [
      contrast({ h: 24, s: 22, l: 14 }, lightBackground),
      contrast({ h: 24, s: 12, l: 38 }, lightBackground),
      contrast({ h: 258.3, s: 56, l: 46 }, { h: 0, s: 0, l: 100 }),
      contrast({ h: 39.3, s: 61.7, l: 90.8 }, darkBackground),
      contrast({ h: 35, s: 31, l: 72 }, darkBackground),
      contrast({ h: 258.3, s: 100, l: 72.9 }, darkBackground),
    ];

    expect(Math.min(...pairs)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps a keyboard or button alternative for every drag interaction', () => {
    const dropScreen = readProjectFile('src/renderer/src/components/screens/DropScreen.tsx');
    const templateEditor = readProjectFile('src/renderer/src/components/TemplateEditor.tsx');
    const renderScreen = readProjectFile('src/renderer/src/components/screens/RenderScreen.tsx');
    const clipCard = readProjectFile('src/renderer/src/components/ClipCard.tsx');

    expect(dropScreen).toContain('Drop a video here or choose a file.');
    expect(dropScreen).toContain('aria-label="Choose a video file or drop it here"');
    expect(dropScreen).toContain('onClick={() => void handleBrowse()}');
    expect(templateEditor).toContain('type="number"');
    expect(templateEditor).toContain("event.key === 'ArrowLeft'");
    expect(renderScreen).toMatch(/aria-label=\{`Move \$\{label\} earlier`\}/);
    expect(renderScreen).toMatch(/aria-label=\{`Move \$\{label\} later`\}/);
    expect(clipCard).toContain('type="checkbox"');
  });

  it('keeps media lists paint-contained and mounts preview decoders only after intent', () => {
    const css = readProjectFile('src/renderer/src/assets/index.css');
    const clipCard = readProjectFile('src/renderer/src/components/ClipCard.tsx');
    const outputCard = readProjectFile('src/renderer/src/components/CompletedOutputCard.tsx');

    expect(css).toContain('content-visibility: auto');
    expect(css).toContain('contain-intrinsic-size: auto 420px');
    expect(clipCard).toContain("mediaPriority = 'lazy'");
    expect(clipCard).toContain('{isHovering && sourceUrl && hoverPreviewEnabled && (');
    expect(outputCard).toContain('preload="none"');
    expect(outputCard).toContain('activeCompletedOutput.pause()');
  });
});
