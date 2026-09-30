import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createRasterExecutable,
  digest,
  openLocalBrowser,
  quotePosixExecutable,
  rendererConfiguration,
} from './harness-runtime.mjs';
import { parseStillsArgs, parseVerificationArgs } from './verification-options.mjs';

function executable(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'batchclip-raster-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "chrome space ' quote $HOME `literal`;\nnew-line");
  writeFileSync(file, '#!/bin/sh\nprintf \'%s\\n\' "$@"\n', { mode: 0o700 });
  return { file, directory };
}
const posix = { skip: process.platform === 'win32' };

test(
  'browser proxy safely quotes metacharacters and forwards arguments literally, adding only one flag',
  posix,
  (t) => {
    const { file, directory } = executable(t);
    const proxy = createRasterExecutable(file);
    t.after(proxy.cleanup);
    const sentinel = path.join(directory, 'must-not-exist');
    const args = [
      '--headless',
      'two words',
      `$(touch ${sentinel})`,
      'semi;colon',
      'single\'double"',
      '--use-gl=angle',
    ];
    assert.equal(
      execFileSync(proxy.browserExecutable, args, { encoding: 'utf8', timeout: 3000 }),
      ['--disable-gpu-rasterization', ...args, ''].join('\n'),
    );
    assert(!existsSync(sentinel));
    assert.equal(statSync(proxy.browserExecutable).mode & 0o777, 0o700);
    assert.match(
      readFileSync(proxy.browserExecutable, 'utf8'),
      /exec .* --disable-gpu-rasterization "\$@"\n$/s,
    );
    proxy.cleanup();
    proxy.cleanup();
    assert(!existsSync(proxy.directory));
    assert(
      existsSync(file),
      'Cleanup must leave the original executable and sibling directory intact',
    );
  },
);

test('invalid executable paths and Windows fail explicitly before launch', () => {
  for (const value of ['relative', '', '/tmp/unsafe\0name', null])
    assert.throws(() => quotePosixExecutable(value), /absolute local path/);
  assert.throws(() => createRasterExecutable('/unused', 'win32'), /unsupported on Windows/);
});

test(
  'temporary proxy is removed on browser launch failure and only owned data is removed',
  posix,
  async (t) => {
    const { file } = executable(t);
    let wrapper;
    await assert.rejects(
      () =>
        openLocalBrowser(
          { softwareRaster: true },
          {
            ensureBrowser: async () => ({ path: file }),
            openBrowser: async (_, options) => {
              wrapper = options.browserExecutable;
              assert(existsSync(wrapper));
              throw new Error('expected launch error');
            },
          },
        ),
      /expected launch error/,
    );
    assert(wrapper);
    assert(!existsSync(path.dirname(wrapper)));
    assert(existsSync(file));
  },
);

test(
  'browser close always removes owned proxy on success or failure, preserving API options and idempotence',
  posix,
  async (t) => {
    const { file } = executable(t);
    for (const fails of [false, true]) {
      let closes = 0;
      const opened = await openLocalBrowser(
        { softwareRaster: true },
        {
          ensureBrowser: async () => ({ path: file }),
          openBrowser: async (_, options) => {
            assert.deepEqual(options.chromiumOptions, { gl: 'angle' });
            return {
              close: async (closeOptions) => {
                closes++;
                assert.deepEqual(closeOptions, { silent: true });
                if (fails) throw new Error('expected close error');
              },
            };
          },
        },
      );
      const wrapper = opened.shared.browserExecutable;
      assert(existsSync(wrapper));
      assert(opened.metadata.ownsTemporaryExecutable);
      assert.deepEqual(opened.metadata.additionalBrowserFlags, ['--disable-gpu-rasterization']);
      if (fails) {
        await assert.rejects(() => opened.browser.close({ silent: true }), /expected close error/);
        await assert.rejects(() => opened.browser.close({ silent: true }), /expected close error/);
      } else {
        await opened.browser.close({ silent: true });
        await opened.browser.close({ silent: true });
      }
      assert.equal(closes, 1);
      assert(!existsSync(path.dirname(wrapper)));
      assert(existsSync(file));
    }
  },
);

test(
  'default browser configuration stays unmodified and configuration hashes distinguish the opt-in',
  posix,
  async (t) => {
    const { file } = executable(t);
    const close = async () => {};
    const opened = await openLocalBrowser(
      {},
      {
        ensureBrowser: async () => ({ path: file }),
        openBrowser: async (_, options) => {
          assert.equal(options.browserExecutable, file);
          return { close };
        },
      },
    );
    assert.equal(opened.shared.browserExecutable, file);
    assert.equal(opened.browser.close, close);
    assert.equal(opened.metadata.ownsTemporaryExecutable, false);
    assert.deepEqual(opened.metadata.additionalBrowserFlags, []);
    assert.deepEqual(rendererConfiguration().chromiumOptions, { gl: 'angle' });
    assert.notEqual(
      digest(rendererConfiguration()),
      digest(rendererConfiguration({ softwareRaster: true })),
    );
    assert.match(rendererConfiguration({ softwareRaster: true }).scope, /NOT production default/);
  },
);

test('software raster is an explicit boolean in stills/motion/systems, preserving legacy positionals and --', () => {
  assert.equal(parseStillsArgs(['fixture.json']).softwareRaster, false);
  assert.deepEqual(
    parseStillsArgs(['fixture.json', 'shield', '--software-raster', '--bundle', '/tmp/bundle']),
    { fixturesArg: 'fixture.json', filter: 'shield', bundle: '/tmp/bundle', softwareRaster: true },
  );
  assert.deepEqual(parseStillsArgs(['fixture.json', '--', '--software-raster']), {
    fixturesArg: 'fixture.json',
    filter: '--software-raster',
    softwareRaster: false,
  });
  assert.equal(
    parseStillsArgs(['fixture.json', '--bundle=--software-raster']).bundle,
    '--software-raster',
  );
  for (const mode of ['motion', 'systems']) {
    assert.equal(parseVerificationArgs([], mode)['software-raster'], false);
    assert.equal(parseVerificationArgs(['--software-raster'], mode)['software-raster'], true);
    assert.throws(() => parseVerificationArgs(['--software-raster=false'], mode));
  }
  assert.throws(() => parseStillsArgs(['fixture.json', '--software-raster=false']));
});
