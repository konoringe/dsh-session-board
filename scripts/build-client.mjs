#!/usr/bin/env node
/**
 * Build lib/client.js — the dsh client bundle for this plugin.
 *
 * dsh client bundles are not plain ESM: the web shell consumes each plugin's
 * "./client" export as a lazy CommonJS-shaped module registered through the
 * boot graph:
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 *
 * External plugins resolve nothing beyond the platform seed, and this plugin
 * intentionally requires only "react". The build therefore needs no bundler:
 * it strips import/export syntax from the two client sources (core.js,
 * board.js), concatenates them into one scope, and wraps them in the loader
 * envelope — exactly the transformation a bundler would perform, but
 * auditable and dependency-free.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const id = pkg.name;

/** Remove ESM import statements (single- and multi-line). */
function stripImports(source) {
  return source.replace(/^import[\s\S]*?from\s*['"][^'"]+['"];[ \t]*$/gm, '');
}

/** Downgrade export declarations to plain top-level declarations. */
function stripExports(source) {
  return source
    .replace(/^export\s+(?=(const|let|var|function|class)\b)/gm, '')
    .replace(/^export\s*\{[^}]*\};[ \t]*$/gm, '');
}

const core = stripExports(stripImports(readFileSync(join(root, 'src/client/core.js'), 'utf8')));
const board = stripExports(stripImports(readFileSync(join(root, 'src/client/board.js'), 'utf8')));

const banner = [
  'window.__ModuleLoader__.load({',
  `	id: ${JSON.stringify(id)},`,
  '	factory: (require) => {',
  '		var module = { exports: {} };',
  '		var exports = module.exports;',
  '		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
  '		let React = require("react");',
  '',
].join('\n');

const footer = [
  '',
  '		exports.apply = apply;',
  '		exports.inject = inject;',
  '		exports.SessionBoard = SessionBoard;',
  '		return module.exports;',
  '	}',
  '});',
  '',
].join('\n');

mkdirSync(join(root, 'lib'), { recursive: true });
writeFileSync(join(root, 'lib/client.js'), banner + '\n' + core + '\n' + board + footer);
process.stdout.write(`[session-board] built lib/client.js for ${id}\n`);
