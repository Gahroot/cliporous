#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const enforceRelease = process.argv.includes('--release');

const expectedAssets = new Map(
  Object.entries({
    'resources/bin/.gitkeep': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'resources/bin/FFMPEG-BUILDS-MIT.txt':
      'c1b3cc7eec42bd9c4f6247169bb887b4a9bc904abfd2a7f7f9231ed357844993',
    'resources/bin/FFMPEG-GPL-3.0.txt':
      '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903',
    'resources/bin/ffmpeg.exe': '9959487dde724f9b3b997a2353517f43c12e1d96b6225029d0f0453242b4a370',
    'resources/bin/ffprobe.exe': '39b64ebddfc338436f2c1d9e5f691a3d82565f37a092349cbd07ea5397bb2651',
    'resources/fonts/.gitkeep': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'resources/fonts/Anton-Regular.ttf':
      'a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab',
    'resources/fonts/Bangers-Regular.ttf':
      '4160a7311de9342674cce9160cde9fcbb30f48190397d86ff1b70b455af65824',
    'resources/fonts/BebasNeue-Regular.ttf':
      '08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73',
    'resources/fonts/Caveat.ttf':
      '0bdb6b660482d31531b3945849fba5916b3ef8695da7024a9e6b9ee3c4157988',
    'resources/fonts/DancingScript.ttf':
      '21808625578fe8d8cd10cb684be546dca077b27cd03a53a2f1ec11dc743c924c',
    'resources/fonts/Geist-Bold.ttf':
      'f032f37d12e82a37977fd1159c01e1a14415672244d2e6865d57e28c74886d03',
    'resources/fonts/InstrumentSerif-Italic.ttf':
      '08939b8bdf534afec24ae0ef5e03f948940cd9a8fe08e7fecbad040e62327385',
    'resources/fonts/InstrumentSerif-Regular.ttf':
      '498efd461f6ddfcb7a111bf9a565709d2085d48201d501ead960d93e84ffbb88',
    'resources/fonts/Inter-Bold.ttf':
      'b37284b5701b6b168dfc770aa1a4ac492106422fd3ba76bc7641e37434e8019c',
    'resources/fonts/Inter.ttf': '29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031',
    'resources/fonts/JetBrainsMono.ttf':
      '48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda',
    'resources/fonts/Lora.ttf': '822a6621ccbe8d97d20ac88c1c41f5615c9c2c202eaa75f272cd452aac6475a7',
    'resources/fonts/Montserrat-Bold.ttf':
      'bc6e854971cea46b463be6f9eef4d9cd52f51cfc1fc0dd90c9d3e6483dc0ec61',
    'resources/fonts/Montserrat.ttf':
      '0f7b311b2f3279e4eef9b2f968bcdbab6e28f4daeb1f049f4f278a902bcd82f7',
    'resources/fonts/Oswald.ttf':
      '5b38c246e255a12f5712d640d56bcced0472466fc68983d2d0410ec0457c2817',
    'resources/fonts/Outfit.ttf':
      'fc7287273e66929776e2ba54f144fe699080bec29f61bf649d70d871468aeade',
    'resources/fonts/PermanentMarker-Regular.ttf':
      '28f82c8a7943cb8e9d599f8554da1d4fc75dbcf69b9885ad6c0611d20c6946c5',
    'resources/fonts/PlayfairDisplay.ttf':
      'c40f2293766a503bc70cce9e512ef844a4ccb7cbcde792fe2ea31d191917d8d6',
    'resources/fonts/Poppins-Bold.ttf':
      '1984efdda0fbe207d7ac20feac2ba7c2768c92a90094b02a206c9d58cc30ff2e',
    'resources/fonts/Poppins-Regular.ttf':
      '7e65201e9b79159e2300267cc885e16c8dcef2424cdfa09a29bfb0980a94a7ba',
    'resources/fonts/PressStart2P-Regular.ttf':
      '034c77f1f05ec89421e4a63f0e3a4ca1ecf852cc6d2bf611f126f275728e017d',
    'resources/fonts/SourceCodePro.ttf':
      'b400fc584e10aff25d0e775ce181b4fc1c5ea1b5dc37b81aeb2084375b945790',
    'resources/fonts/StyleScript-Regular.ttf':
      'e77c77bfaf9f79d5a1a5d4e8d3674ee7fa98dce1deb4ee8cdf1aef70b5229408',
    'resources/brand/app-icon-concept.png':
      '5f5dc1a2d8bd8c4928af1cff69d6dde1e84612ba3e7d8b40986beb89a98f93b4',
    'resources/music/README.md': '673c49f8021ab71e21eb4c8e976d2e5fa8e6de5ebc60e1b3ce4d488632eb88a1',
    'resources/sfx/README.md': '5c31ae822f178efe742e4f12813ed86b67c2927fa44f383e80fcb8cf4b6830cd',
    'resources/sfx/bass-drop.mp3':
      '9a8aeaa2065b38cdfca9c20ab12a7386d799204db7c33cc1921a04e640e7e017',
    'resources/sfx/camera-shutter.mp3':
      '5984cc0e0c6572b9a30e96424fa3141a568a4977381a31116e690520017f193f',
    'resources/sfx/rise-tension-short.mp3':
      '8ba5a60589c60b46a33d3f132dcba0858d817d74c8c67198f16a01a32cb2f726',
    'resources/sfx/swipe-transition.mp3':
      '5082fbf4e588362b9d4f36ce8455fd99f42acaeaef4e567df64aef098c99d1d2',
    'resources/sfx/typewriter-key.mp3':
      'd8e0d949ef8da2da95e86dfb98168a8fdea06932e82bfbfdf967f96c822a02a2',
    'resources/sfx/word-pop.mp3':
      '8ae8c9581173692884cc067139539f5c491ef867656019490114ee345a26773a',
    'build/dmg-background.png': '5131352c34de4b4859cb3729ab17dfe1f41dfd1daa906b57ea7d60d3d8f1a138',
    'build/icon.icns': 'c042a8f282e9c3aaae966b150cbe7915da2e8426bef5e54c47413c995beeecf4',
    'build/icon.ico': 'de3910a248f2e9e30091365d936d4c53a10cebb2c1eb0a08591c2fdb648e8a4e',
    'build/icon.iconset/icon_128x128.png':
      '81c5879b15ae94a994e02b297a7947580663c9b1da573fc2b452074027a5df13',
    'build/icon.iconset/icon_128x128@2x.png':
      '49f247545dec5b8df91215d0e465c758d753ac8c7d64f4bdfa11e322d66cfeb2',
    'build/icon.iconset/icon_16x16.png':
      '44205147bd474b7c023c79c34e8f4533586243bcc8e5dcf2a11df679b00593bf',
    'build/icon.iconset/icon_16x16@2x.png':
      '0fec342a31fae7f15da4363c12ad252faafe437f85bf300bd663eee3cd10b877',
    'build/icon.iconset/icon_256x256.png':
      '49f247545dec5b8df91215d0e465c758d753ac8c7d64f4bdfa11e322d66cfeb2',
    'build/icon.iconset/icon_256x256@2x.png':
      'ee415f769b033b0b0c8c72c8b2419bf4396780dbe32055e1b5d9c07d088e9514',
    'build/icon.iconset/icon_32x32.png':
      '0fec342a31fae7f15da4363c12ad252faafe437f85bf300bd663eee3cd10b877',
    'build/icon.iconset/icon_32x32@2x.png':
      '832f030a40b92211937a5610c19b919822f2fc819c1584ed1723733126f56530',
    'build/icon.iconset/icon_512x512.png':
      'ee415f769b033b0b0c8c72c8b2419bf4396780dbe32055e1b5d9c07d088e9514',
    'build/icon.iconset/icon_512x512@2x.png':
      '8772c5fd11ad5319fb4f657f8f96820e48e51cd4024c44aeeb9e4b9d2b95a65b',
    'build/icon.png': '8772c5fd11ad5319fb4f657f8f96820e48e51cd4024c44aeeb9e4b9d2b95a65b',
    'build/icon.svg': 'eb60503667b438603258e015268a8c494b8473b031b5bb64f09656576dfd980e',
    'build/icons/1024x1024.png': '8772c5fd11ad5319fb4f657f8f96820e48e51cd4024c44aeeb9e4b9d2b95a65b',
    'build/icons/128x128.png': '81c5879b15ae94a994e02b297a7947580663c9b1da573fc2b452074027a5df13',
    'build/icons/16x16.png': '44205147bd474b7c023c79c34e8f4533586243bcc8e5dcf2a11df679b00593bf',
    'build/icons/256x256.png': '49f247545dec5b8df91215d0e465c758d753ac8c7d64f4bdfa11e322d66cfeb2',
    'build/icons/32x32.png': '0fec342a31fae7f15da4363c12ad252faafe437f85bf300bd663eee3cd10b877',
    'build/icons/48x48.png': '96bfb0232d8994b42485a9691689093254d672928a2064b783df2635e5a2c786',
    'build/icons/512x512.png': 'ee415f769b033b0b0c8c72c8b2419bf4396780dbe32055e1b5d9c07d088e9514',
    'build/icons/64x64.png': '832f030a40b92211937a5610c19b919822f2fc819c1584ed1723733126f56530',
    'build/installerHeader.bmp': '3c52446706d8874658308ff55f1381e0de7a97f95b7f86e6bdb54a5045ed085b',
    'build/installerSidebar.bmp':
      'c59a7dad4513f075669a6d28c4e89dc643378d7a27cb1eeeef8c71342836e866',
  }),
);

const expectedPackages = new Map([
  ['node_modules/@fontsource/inter', '5.2.8'],
  ['node_modules/better-sqlite3', '12.9.0'],
  ['node_modules/electron', '34.5.8'],
  ['node_modules/fsevents', '2.3.3'],
  ['node_modules/lucide-react', '0.475.0'],
]);

const expectedPackageFamilies = [
  [/^node_modules\/@rspack\/binding-/, new Set(['1.7.6', '1.7.11'])],
  [/(^|node_modules\/)@esbuild\//, new Set(['0.25.0', '0.25.12', '0.27.7', '0.28.1'])],
  [/(^|node_modules\/)esbuild$/, new Set(['0.25.0', '0.25.12', '0.27.7', '0.28.1'])],
];

const releaseBlockers = [];

const failures = [];

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (entry.isFile()) files.push(relative(root, absolute));
  }
  return files;
}

function hashFile(path) {
  return createHash('sha256')
    .update(readFileSync(resolve(root, path)))
    .digest('hex');
}

const assetExtensions = new Set([
  '.bmp',
  '.gif',
  '.icns',
  '.ico',
  '.jpeg',
  '.jpg',
  '.m4a',
  '.mp3',
  '.ogg',
  '.otf',
  '.png',
  '.svg',
  '.ttf',
  '.wav',
  '.webp',
  '.woff',
  '.woff2',
]);

const discoveredAssets = new Set([
  ...walkFiles(resolve(root, 'resources')),
  ...walkFiles(resolve(root, 'build')),
]);
for (const path of walkFiles(resolve(root, 'src'))) {
  if (assetExtensions.has(extname(path).toLowerCase())) discoveredAssets.add(path);
}

for (const path of discoveredAssets) {
  if (!expectedAssets.has(path)) failures.push(`Unaudited asset: ${path}`);
}
for (const [path, expectedHash] of expectedAssets) {
  if (!existsSync(resolve(root, path))) {
    failures.push(`Missing audited asset: ${path}`);
    continue;
  }
  const actualHash = hashFile(path);
  if (actualHash !== expectedHash) failures.push(`Changed audited asset: ${path} (${actualHash})`);
}

const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
for (const [packagePath, expectedVersion] of expectedPackages) {
  const actual = lock.packages?.[packagePath]?.version;
  if (actual !== expectedVersion) {
    failures.push(
      `Dependency drift: ${packagePath} expected ${expectedVersion}, found ${actual ?? 'missing'}`,
    );
  }
}

for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
  for (const [pattern, expectedVersions] of expectedPackageFamilies) {
    if (pattern.test(packagePath) && !expectedVersions.has(metadata.version)) {
      failures.push(`Binary dependency drift: ${packagePath}@${metadata.version ?? 'unknown'}`);
    }
  }
}

const noticePath = resolve(root, 'THIRD_PARTY_NOTICES.md');
if (!existsSync(noticePath)) failures.push('Missing release-facing THIRD_PARTY_NOTICES.md');
else {
  const notice = readFileSync(noticePath, 'utf8');
  if (!notice.includes('**Release status:** **CLEARED')) {
    failures.push('Third-party notice does not record cleared status');
  }
}

if (failures.length > 0) {
  console.error('Third-party asset audit integrity: FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Third-party asset audit integrity: PASS (${expectedAssets.size} files verified)`);
console.log('Redistribution review: CLEARED (0 unresolved items)');
console.log('Details: THIRD_PARTY_NOTICES.md');

if (enforceRelease && releaseBlockers.length > 0) {
  console.error('\nRelease refused: resolve every redistribution blocker before packaging.');
  process.exit(1);
}
