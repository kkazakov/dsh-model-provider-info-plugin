/**
 * Smoke test for the Model provider info bundle.
 *
 * It loads the browser half the way the Harness module loader does — a classic
 * script calling `window.__ModuleLoader__.load` — drives the plugin body with a
 * stub Cordis context, and checks what the label renders in each placement,
 * then checks the package manifest against the files on disk. It needs neither
 * a Harness installation nor a browser.
 *
 * Run: node test-plugin.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

/** Minimal React surface the browser half touches at load time. */
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
};

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const readJson = (path) => JSON.parse(read(path));

let failures = 0;
let checks = 0;

/**
 * Assert one condition and print its result.
 * @param label - what is being checked.
 * @param ok - the condition.
 * @param detail - value printed with a failure.
 */
function check(label, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || detail === '' ? '' : ` — ${detail}`}`);
}

/**
 * Flatten a rendered tree to its visible text.
 * @param node - a string, number, null, or createElement result.
 * @returns the concatenated text.
 */
function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.children);
}

/**
 * Collect every element in a rendered tree, in order.
 * @param node - rendered tree.
 * @returns the elements.
 */
function elementsOf(node) {
  if (node === null || node === undefined || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elementsOf);
  return [{ props: node.props, children: node.children }, ...node.children.flatMap(elementsOf)];
}

/** Load the browser half and return its `__ModuleLoader__.load` registration. */
function loadBundle() {
  const registrations = [];
  const window = { __ModuleLoader__: { load: (registration) => registrations.push(registration) } };
  new Function('window', read('./client.js'))(window);
  return registrations;
}

const pkg = readJson('./package.json');
const en = readJson('./locale/en.json');
const [registration, ...extra] = loadBundle();

check('bundle registers exactly one module', registration !== undefined && extra.length === 0);
check('module id matches the package name', registration?.id === pkg.name, registration?.id);

const plugin = registration.factory((request) => {
  if (request === 'react') return React;
  throw new Error(`unexpected module request: ${request}`);
});

check('factory returns a plugin with inject + apply',
  Array.isArray(plugin.inject) && typeof plugin.apply === 'function');

/** Stub Cordis context recording slot injections. */
function stubContext() {
  const injections = [];
  const registrations = [];
  const ctx = {
    slots: {
      inject: (key, callback) => {
        injections.push({ key, dispose: callback() });
      },
      register: (options, component) => {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };
  return { ctx, injections, registrations };
}

const { ctx, injections, registrations } = stubContext();
plugin.apply(ctx);

check('injects the model label slot',
  injections.length === 1 && injections[0].key === 'conversation.input.model.label',
  JSON.stringify(injections.map(i => i.key)));
check('registers one label occupant', registrations.length === 1);
check('registers under the owner slot name',
  registrations[0]?.options.name === 'conversation.input.model.label');

const Label = registrations[0].component;
const provider = { id: 'opencode-go', name: 'opencode-go' };
const named = { id: 'deepseek-account', name: 'DeepSeek account' };
const model = { id: 'deepseek-v4.1-flash-1017', name: 'deepseek-v4.1-flash-1017' };

// The chip: provider, separator, then the model name.
const trigger = Label({ provider, model, placement: 'trigger', selected: true });
check('chip reads "provider: model"',
  textOf(trigger) === 'opencode-go: deepseek-v4.1-flash-1017', JSON.stringify(textOf(trigger)));
check('chip marks the provider span with the caption token',
  elementsOf(trigger).some(el => el.props.style?.color === 'var(--dsw-alias-label-caption)'));

// The root menu: provider line above the model name.
const menu = Label({ provider, model, placement: 'menu', selected: true });
check('menu stacks provider above model',
  textOf(menu).trim() === 'opencode-go deepseek-v4.1-flash-1017', JSON.stringify(textOf(menu)));
const stack = elementsOf(menu)[0];
check('menu stack is a column', stack?.props.style?.flexDirection === 'column');
check('menu stack is right-aligned', stack?.props.style?.alignItems === 'flex-end');
check('menu line order is provider, then model',
  textOf(menu).indexOf('opencode-go') < textOf(menu).indexOf('deepseek-v4.1-flash-1017'));

// A selectable row: model name only, because the list groups by provider.
const option = Label({ provider, model, placement: 'option', selected: false });
check('option row shows the plain model name',
  textOf(option) === 'deepseek-v4.1-flash-1017', JSON.stringify(textOf(option)));

// Display name wins over the id when a provider configures one.
check('configured display name is used',
  textOf(Label({ provider: named, model, placement: 'trigger', selected: true })).startsWith('DeepSeek account: '));
check('a provider without a display name falls back to its id',
  textOf(Label({ provider: { id: 'alibaba', name: 'alibaba' }, model, placement: 'menu', selected: true }))
    .trim().startsWith('alibaba '));
check('an unnamed provider renders the model alone',
  textOf(Label({ provider: { id: '', name: '' }, model, placement: 'trigger', selected: true })) === model.name);
check('malformed owner props do not throw', (() => {
  try {
    Label({ provider: null, model: null, placement: 'trigger' });
    Label({});
    return true;
  } catch {
    return false;
  }
})());

// Manifest and files.
check('package name is published under the wasp scope', pkg.name === '@wasp/dsh-model-provider-info', pkg.name);
check('bundle declares its patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml');
check('client half targets the web platform', pkg.dsh?.client?.platform === 'web');
check('client half is load-immediate', pkg.dsh?.client?.immediately === true);
check('client half orders after the model selector',
  pkg.dsh?.client?.inject?.includes('@deepseek-ai/dsh-client-ui-model-selection'));
check('license is MIT', pkg.license === 'MIT');

for (const [subpath, target] of Object.entries(pkg.exports)) {
  if (subpath === './locale/*.json') continue;
  check(`export ${subpath} resolves`, existsSync(new URL(target, import.meta.url)), target);
}

const runtimeFiles = ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'locale/en.json'];
for (const file of runtimeFiles) {
  check(`${file} exists`, existsSync(new URL(file, import.meta.url)));
  const covered = pkg.files.some(pattern => pattern === file
    || (pattern.endsWith('*.json') && file.startsWith(pattern.slice(0, pattern.indexOf('*')))));
  check(`${file} is packaged by files[]`, covered);
}

check('locale declares a title', typeof en.meta?.title === 'string' && en.meta.title !== '');
check('locale declares a description', typeof en.meta?.description === 'string' && en.meta.description !== '');
check('no detail document is declared', en.meta?.detail === undefined);

const patch = read('./cordis.patch.yml');
check('patch inserts the package row', patch.includes('@wasp/dsh-model-provider-info'));

const icon = read('./icon.svg');
check('icon is a 36x36 SVG', icon.includes('width="36"') && icon.includes('height="36"'));
check('icon is self-contained', !/<script|<style|<image|foreignObject/.test(icon));

// Every relative image the README shows must exist, and be packaged for npm.
const readme = read('./README.md');
const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]);
check('README shows at least one image', images.length > 0);
for (const image of images) {
  if (/^https?:/.test(image)) continue;
  check(`README image ${image} exists`, existsSync(new URL(image, import.meta.url)));
  const covered = pkg.files.some(pattern => pattern === image
    || (pattern.endsWith('*') && image.startsWith(pattern.slice(0, pattern.indexOf('*'))))
    || image.startsWith(`${pattern}/`));
  check(`README image ${image} is packaged by files[]`, covered);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
