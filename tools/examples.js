// The recipes in examples/, opened in headless Chrome the way a site serves
// them: under the Content Security Policy the README states, with the CDN
// answered from this checkout and only with files the npm package ships.
// Every flag request must succeed, every flag must draw at its size, and
// axe-core must find nothing. The React recipe must type-check, with a
// mistyped code as a type error, and the stylesheet must behave as the
// README says beyond what the recipes use.
// Needs Chrome (CHROME_PATH, or the usual install location) and Python with
// Jinja2 (PYTHON, default python3).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { packaged, CDN } from './pack.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, 'tmp', 'examples');
const SITE = 'https://example.test/';
const CSP = "default-src 'none'; img-src https://cdn.jsdelivr.net; style-src 'self' https://cdn.jsdelivr.net";
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sizes = Object.fromEntries(JSON.parse(read('dist/manifest.json')).map((m) => [m.code, [m.width, m.height]]));
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
// Codes as data holds them: either case, aliases, a region, and one without
// a flag. country_name is what the app would look up; React looks names up.
const ORDERS = [
  { id: 1001, country: 'PL', country_name: 'Poland' },
  { id: 1002, country: 'ch', country_name: 'Switzerland' },
  { id: 1003, country: 'NP', country_name: 'Nepal' },
  { id: 1004, country: 'UK', country_name: 'United Kingdom' },
  { id: 1005, country: 'EL', country_name: 'Greece' },
  { id: 1006, country: 'gb-sct', country_name: 'Scotland' },
  { id: 1007, country: 'XX-INVALID', country_name: 'Unknown country' },
];

const chrome = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
if (!chrome) { console.error('no Chrome found: set CHROME_PATH'); process.exit(1); }

const failures = [];
const fail = (msg) => failures.push(msg);
fs.mkdirSync(TMP, { recursive: true });

// A page: its URL on the test site and the site's files.
const pages = [
  { name: 'html', path: 'html/index.html', files: { 'html/index.html': read('examples/html/index.html'), 'html/site.css': read('examples/html/site.css') } },
  { name: 'email', path: 'email/index.html', files: { 'email/index.html': read('examples/email/index.html') } },
];

// Jinja, rendered by Jinja2 with autoescaping, as Flask does, with the codes
// from the manifest as the recipe says. Without them, data that isn't a code
// must still come out as xx, never as another URL or class.
const JINJA = `import json, sys, jinja2
def env(**globals):
    e = jinja2.Environment(loader=jinja2.FileSystemLoader(sys.argv[1]), autoescape=True)
    e.globals.update(globals)
    return e
flag = env().get_template("flags.html").module.flag
for code in ["../../../../other@1/x", "pl hidden", "pl\\" onerror=x", "", None]:
    for name in ["", "Name"]:
        out = str(flag(code, name))
        xx = '/dist/svg/xx.svg"' if name else 'class="famfamfam-flags xx"'
        if xx not in out or "other" in out or "onerror" in out:
            sys.exit(f"flags.html passes {code!r} through: {out}")
codes = {f["code"] for f in json.load(open(sys.argv[2]))}
sys.stdout.write(env(flag_codes=codes).get_template("orders.html").render(orders=json.load(sys.stdin)))`;
const py = spawnSync(process.env.PYTHON || 'python3', ['-c', JINJA, path.join(ROOT, 'examples', 'jinja'), path.join(ROOT, 'dist', 'manifest.json')],
  { input: JSON.stringify(ORDERS), encoding: 'utf8' });
if (py.status === 0) pages.push({ name: 'jinja', path: 'jinja/orders.html', files: { 'jinja/orders.html': py.stdout } });
else {
  const err = (py.stderr || String(py.error)).trim().split('\n').pop();
  fail(`jinja: ${err}${/No module named|ENOENT/.test(err) ? ' (needs Python with Jinja2: pip install jinja2, or set PYTHON)' : ''}`);
}

// React: tsc checks the recipe against the package's own types, a mistyped
// code must be a type error, and react-dom renders what the recipe compiles to.
const tsc = (config) => {
  const r = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', config], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? null : (r.stdout + r.stderr).trim() || String(r.error);
};
const tsconfig = (name, options) => {
  fs.writeFileSync(path.join(TMP, name), JSON.stringify({ extends: '../../examples/react/tsconfig.json', ...options }));
  return path.join('tmp', 'examples', name);
};
fs.writeFileSync(path.join(TMP, 'typos.tsx'), `import { flagUrl, flags, isFlagCode, type FlagCode } from "famfamfam-flags-svg";
import { Flag } from "../../examples/react/Flag";
flagUrl("pl"); flagUrl("PL"); flagUrl("gb-sct"); flagUrl("uk");
// @ts-expect-error: a language, not a flag code
flagUrl("en");
// @ts-expect-error: mixed case is no code
flagUrl("Pl");
const fromData: string = "PL";
// @ts-expect-error: a code from data needs narrowing
flagUrl(fromData);
if (isFlagCode(fromData)) flagUrl(fromData);
const code: FlagCode = "ch";
const size: { width: number; height: number } = flags[code];
const known: string = flags.pl.name;
const maybe: string | undefined = flags[fromData.toLowerCase()]?.name;
// @ts-expect-error: flags are read-only
flags.pl = flags.de;
<Flag code="np" name="Nepal" />;
// @ts-expect-error: a name is required, "" beside the country's name
<Flag code="np" />;
// @ts-expect-error: not a flag code
<Flag code="en" name="English" />;
export { size, known, maybe };
`);
const typeErrors = tsc('examples/react') || tsc(tsconfig('tsconfig.typos.json', { include: [], files: ['typos.tsx'] }));
const emitErrors = typeErrors || tsc(tsconfig('tsconfig.emit.json', { compilerOptions: { noEmit: false, rootDir: '../../examples/react', outDir: 'react' } }));
if (emitErrors) fail(`react: ${emitErrors}`);
else {
  // A bundler resolves "./Flag"; Node needs the extension.
  for (const f of fs.readdirSync(path.join(TMP, 'react'))) {
    const p = path.join(TMP, 'react', f);
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/from "(\.\/[^".]+)"/g, 'from "$1.js"'));
  }
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { Orders } = await import(pathToFileURL(path.join(TMP, 'react', 'Orders.js')));
  try {
    const body = renderToStaticMarkup(createElement(Orders, { orders: ORDERS.map(({ id, country }) => ({ id, country })), lang: 'en' }));
    // Names from Intl, the package's English names, or the code as it came.
    for (const { country, country_name } of ORDERS) {
      const want = country === 'XX-INVALID' ? country : country_name;
      if (!body.includes(`> ${want}</td>`)) fail(`react: no "${want}" for ${country}`);
    }
    pages.push({ name: 'react', path: 'react/index.html', files: { 'react/index.html': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Orders</title></head><body>${body}</body></html>` } });
  } catch (e) { fail(`react: rendering Orders: ${e.message}`); }
}

// The stylesheet, beyond the recipes: each data-expect is "code WxH [display]".
const css = `${CDN}dist/famfamfam-flags.css`;
const integrity = 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(path.join(ROOT, 'dist', 'famfamfam-flags.css'))).digest('base64');
const flag = (cls, expect, tag = 'span') => `<${tag} class="${cls}" data-expect="${expect}" aria-hidden="true"></${tag}>`;
pages.push({ name: 'stylesheet', path: 'stylesheet/index.html', files: {
  'stylesheet/site.css': '.x2 { --famfamfam-flags-scale: 2 }\n.x3 .famfamfam-flags { --famfamfam-flags-scale: 3 }\n:where(.own) span { height: 22px }\n' +
    // The README's column alignment.
    '.column .famfamfam-flags { aspect-ratio: 16 / 11; background-position: left }\n.column img { width: 16px; object-fit: contain; object-position: left }\n',
  'stylesheet/index.html': `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Stylesheet</title>
<link rel="stylesheet" href="${css}" integrity="${integrity}" crossorigin="anonymous"><link rel="stylesheet" href="site.css"></head>
<body><main><h1>Stylesheet</h1>
<p>${[flag('famfamfam-flags pl', 'pl 16x11 inline-block'), flag('famfamfam-flags de', 'de 16x11 inline-block', 'i'),
    flag('famfamfam-flags ch', 'ch 11x11'), flag('famfamfam-flags np', 'np 9x11'), flag('famfamfam-flags gb-sct', 'gb-sct 16x11'),
    flag('famfamfam-flags zz', 'xx 16x11'), flag('famfamfam-flags PL', 'xx 16x11')].join(' ')} Poland</p>
${flag('famfamfam-flags fr', 'fr 16x11 block', 'div')}
<p class="x2">${flag('famfamfam-flags np', 'np 18x22')} ${flag('famfamfam-flags pl', 'pl 32x22')} Nepal</p>
<p class="x3">${flag('famfamfam-flags ch', 'ch 33x33')} Switzerland</p>
<p class="own">${flag('famfamfam-flags pl', 'pl 32x22')} Poland</p>
<ul class="column"><li>${flag('famfamfam-flags ch', 'ch 16x11')} Switzerland</li><li>${flag('famfamfam-flags np', 'np 16x11')} Nepal</li>
<li><img src="${CDN}dist/svg/ch.svg" height="11" alt="" data-expect="ch 16x11"> Switzerland</li></ul>
</main></body></html>`,
} });

// What the CDN would answer: files the npm package ships.
function cdn(rel) {
  if (!packaged(rel)) return null;
  const file = path.join(ROOT, rel);
  return fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : null;
}

const axe = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
// Linux runners restrict the user namespaces Chrome's sandbox needs; these pages are our own.
const browser = await puppeteer.launch({ executablePath: chrome, args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
const report = [];
try {
  for (const p of pages) {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });
    const status = new Map(), errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url(), ext = path.extname(new URL(url).pathname);
      const body = url.startsWith(CDN) ? cdn(decodeURIComponent(url.slice(CDN.length))) : url.startsWith(SITE) ? p.files[url.slice(SITE.length)] : null;
      if (url === SITE + 'favicon.ico') return req.respond({ status: 404, body: '' });
      status.set(url, body == null ? 404 : 200);
      if (body == null) return req.respond({ status: 404, body: '' });
      req.respond({ status: 200, contentType: TYPES[ext], body,
        headers: { 'access-control-allow-origin': '*', ...(ext === '.html' ? { 'content-security-policy': CSP } : {}) } });
    });
    await page.goto(SITE + p.path, { waitUntil: 'networkidle0' });

    for (const [url, s] of status) if (s !== 200) fail(`${p.name}: ${url} is a ${s}`);
    for (const e of errors) fail(`${p.name}: console: ${e}`);
    const flags = await page.evaluate(() => [...document.querySelectorAll('img, .famfamfam-flags')].map((el) => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return el.tagName === 'IMG'
        ? { what: el.outerHTML, url: el.currentSrc, ok: el.complete && el.naturalWidth > 0, w: r.width, h: r.height, display: s.display, expect: el.dataset.expect }
        : { what: el.outerHTML, url: (s.backgroundImage.match(/url\("(.*)"\)/) || [])[1], ok: true, w: r.width, h: r.height, display: s.display,
            expect: el.dataset.expect, print: s.printColorAdjust };
    }));
    if (!flags.length) fail(`${p.name}: no flags`);
    for (const f of flags) {
      const code = (f.url || '').match(/\/svg\/([a-z-]+)\.svg$/)?.[1];
      const [w, h] = sizes[code] || [];
      const bad = (why) => fail(`${p.name}: ${f.what}: ${why}`);
      if (!f.ok || status.get(f.url) !== 200) bad(`${f.url} did not load`);
      else if (!w) bad(`${f.url} is not a flag`);
      else if (!f.expect && (!Number.isInteger(f.h / 11) || Math.abs(f.w - f.h * w / h) > 0.01)) bad(`drawn ${f.w}x${f.h}, not a whole multiple of ${w}x${h}`);
      if (f.print && f.print !== 'exact') bad(`print-color-adjust is ${f.print}`);
      if (f.expect) {
        const [ecode, esize, edisplay] = f.expect.split(' ');
        if (code !== ecode || `${f.w}x${f.h}` !== esize || (edisplay && f.display !== edisplay)) bad(`expected ${f.expect}, got ${code} ${f.w}x${f.h} ${f.display}`);
      }
    }
    await page.evaluate(axe);
    const { violations } = await page.evaluate(() => window.axe.run());
    for (const v of violations) fail(`${p.name}: axe ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
    report.push(`${p.name} ${flags.length}`);
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length) { console.error(failures.join('\n')); console.error(`\n${failures.length} failures`); process.exit(1); }
console.log(`examples ok under the README's CSP, every flag request 200, drawn at size, axe clean (flags per page: ${report.join(', ')}); React recipe type-checks, typos don't`);
