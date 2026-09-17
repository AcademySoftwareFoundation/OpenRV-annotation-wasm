#!/usr/bin/env node
// Smoke tests for the annotation_platform WASM artifacts (CJS + ESM).
// Run after `make wasm`: node test/unit/smoke-test.mjs

import { createRequire } from 'module';
import fs from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertModuleFormat, assertNoModernOperators } from './assert-no-modern-operators.mjs';
import { runWasmSmokeTests } from './wasm-smoke-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmDir = path.join(__dirname, '..', '..', 'build-wasm', 'bindings', 'wasm');
const cjsPath = path.join(wasmDir, 'annotation_platform.cjs.js');
const esmPath = path.join(wasmDir, 'annotation_platform.esm.mjs');

function checkArtifactsExist() {
    for (const artifactPath of [cjsPath, esmPath]) {
        if (!fs.existsSync(artifactPath)) {
            console.error(`Missing WASM artifact: ${artifactPath}`);
            console.error('Run `make wasm` first.');
            process.exit(1);
        }
    }
}

function checkSyntaxAndFormat() {
    console.log('Syntax and module format:');
    const cjsSource = fs.readFileSync(cjsPath, 'utf8');
    const esmSource = fs.readFileSync(esmPath, 'utf8');

    assertNoModernOperators(cjsSource, 'CJS build');
    assertNoModernOperators(esmSource, 'ESM build');
    assertModuleFormat(cjsSource, 'CJS build', 'cjs');
    assertModuleFormat(esmSource, 'ESM build', 'esm');

    console.log('  ✓ CJS: no forbidden operators, CommonJS format');
    console.log('  ✓ ESM: no forbidden operators, ESM format');
}

async function runRuntimeSmoke(label, loadFactory) {
    console.log(`\nRuntime smoke (${label}):`);
    const AnnotationPlatform = await loadFactory();
    const Module = await AnnotationPlatform();
    const { passed, failed } = runWasmSmokeTests(Module);
    const total = passed + failed;
    console.log(`\n${label}: ${total} checks: ${passed} passed, ${failed} failed.`);
    return failed;
}

checkArtifactsExist();
checkSyntaxAndFormat();

const require = createRequire(import.meta.url);

const cjsFailures = await runRuntimeSmoke('CJS', async () => require(cjsPath));

const { default: AnnotationPlatformEsm } = await import(pathToFileURL(esmPath).href);
const esmFailures = await runRuntimeSmoke('ESM', async () => AnnotationPlatformEsm);

const totalFailed = cjsFailures + esmFailures;
console.log(`\nOverall: ${totalFailed === 0 ? 'all passed' : `${totalFailed} check(s) failed`}.\n`);
process.exit(totalFailed > 0 ? 1 : 0);
