// Bundles the prototype into single HTML files (no dependencies):
//   dist/samso-schetslab.html   page fragment for a claude.ai Artifact (no <html>/<head>)
//   dist/samso-standalone.html  complete page: open it in Safari, AirDrop it, or host it anywhere
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const SOURCES = ['geometry.js', 'shapes.js', 'music.js', 'reader.js', 'taste.js', 'synth.js', 'transport.js', 'demo.js', 'app.js'];

const read = (f) => readFileSync(join(here, 'src', f), 'utf8');
const css = read('style.css');
const js = SOURCES.map((f) => `/* ---- ${f} ---- */\n${read(f)}`).join('\n');
if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error('source contains a closing script/style tag');

const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Rubik:wght@400;500;600&display=swap">';
const body = `<div id="app"></div>\n<script>\n${js}\n</script>\n`;

const fragment = `<title>SamSo Schetslab</title>\n${fonts}\n<style>\n${css}\n</style>\n${body}`;

const standalone = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="SamSo">
<title>SamSo Schetslab</title>
${fonts}
<style>
${css}
</style>
</head>
<body>
${body}</body>
</html>
`;

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'samso-schetslab.html'), fragment);
writeFileSync(join(here, 'dist', 'samso-standalone.html'), standalone);
console.log(`built dist/ (${Math.round(fragment.length / 1024)} KB)`);
