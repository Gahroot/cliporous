import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../../..');
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  build: { extraResources: Array<{ from: string; to: string }> };
};

describe('packaged Remotion runtime', () => {
  it('ships the renderer peer dependencies required by Electron', () => {
    expect(packageJson.dependencies).toHaveProperty('react');
    expect(packageJson.dependencies).toHaveProperty('react-dom');
    expect(packageJson.devDependencies).not.toHaveProperty('react');
    expect(packageJson.devDependencies).not.toHaveProperty('react-dom');
  });

  it('prebuilds compositions into a physical extraResources directory', () => {
    const renderSource = readFileSync(resolve(projectRoot, 'src/main/remotion/render.ts'), 'utf8');

    expect(packageJson.scripts.build).toContain('scripts/build-remotion-bundle.mjs');
    expect(packageJson.build.extraResources).toContainEqual(
      expect.objectContaining({ from: 'out/remotion', to: 'remotion' }),
    );
    expect(renderSource).toContain("join(process.resourcesPath, 'remotion')");
    expect(renderSource).toContain("app.getPath('userData')");
    expect(renderSource).toContain('process.chdir(userDataDirectory)');
    expect(renderSource).toContain('app.isPackaged');
  });
});
