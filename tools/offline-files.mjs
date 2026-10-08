import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';

const SITE_THEME = { background_color: '#03080f', theme_color: '#071627' };
const ICON = '../../assets/img/mark.svg';
const DEV_ONLY = /(^|\/)(tools|docs)\/|\.(md|mjs)$/;
const GENERATED = new Set(['offline-files.json']);

function trackedFiles(dir) {
  return execFileSync('git', ['ls-files', dir], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

function sharedAssets(appDir, pages) {
  const refs = new Set([ICON]);
  for (const page of pages) {
    for (const [, ref] of readFileSync(posix.join(appDir, page), 'utf8').matchAll(/(?:href|src)="((?:\.\.\/)+assets\/[^"]+)"/g)) {
      refs.add(posix.join(posix.dirname(page), ref));
    }
  }
  return [...refs];
}

function pageUrl(page) {
  return page === 'index.html' ? './' : page.replace(/index\.html$/, '');
}

function manifestFor(appDir) {
  const html = readFileSync(posix.join(appDir, 'index.html'), 'utf8');
  const name = html.match(/<title>(.*?)(?: &mdash;.*)?<\/title>/)[1];
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  return {
    name,
    short_name: name,
    ...(description && { description }),
    start_url: './',
    scope: './',
    display: 'standalone',
    ...SITE_THEME,
    icons: [{ src: ICON, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}

function buildApp(appDir) {
  writeFileSync(posix.join(appDir, 'manifest.webmanifest'), `${JSON.stringify(manifestFor(appDir), null, 2)}\n`);

  const own = trackedFiles(appDir)
    .map((file) => posix.relative(appDir, file))
    .filter((file) => !DEV_ONLY.test(file) && !GENERATED.has(file));
  if (!own.includes('manifest.webmanifest')) own.push('manifest.webmanifest');
  const pages = own.filter((file) => file.endsWith('.html'));
  const stored = [...own, ...sharedAssets(appDir, pages)];
  const files = [...pages.filter((page) => page.endsWith('index.html')).map(pageUrl), ...stored];
  const bytes = stored.reduce((sum, file) => sum + statSync(posix.join(appDir, file)).size, 0);

  writeFileSync(posix.join(appDir, 'offline-files.json'), `${JSON.stringify({ bytes, files }, null, 2)}\n`);
  return { appDir, count: files.length, bytes };
}

const apps = trackedFiles('apps')
  .filter((file) => /^apps\/[^/]+\/index\.html$/.test(file))
  .map(posix.dirname);

for (const { appDir, count, bytes } of apps.map(buildApp)) {
  console.log(`${appDir}: ${count} files, ${(bytes / 1e6).toFixed(1)} MB`);
}
