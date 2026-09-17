/**
 * Operators that Emscripten may emit in glue code and that webpack 4 cannot parse.
 * MIN_*_VERSION link flags should transpile these away; this check catches regressions.
 */
export const FORBIDDEN_OPERATORS = [
    [/\?\?=/, 'logical nullish assignment (??=)'],
    [/\|\|=/, 'logical OR assignment (||=)'],
    [/\&\&=/, 'logical AND assignment (&&=)'],
    [/\?\./, 'optional chaining (?.)'],
    [/\?\?/, 'nullish coalescing (??)'],
];

/** @param {string} source @param {string} label */
export function assertNoModernOperators(source, label) {
    for (const [pattern, name] of FORBIDDEN_OPERATORS) {
        if (pattern.test(source)) {
            throw new Error(`${label}: found ${name}`);
        }
    }
}

/** @param {string} source @param {string} label @param {'cjs' | 'esm'} format */
export function assertModuleFormat(source, label, format) {
    if (format === 'cjs') {
        if (!/module\.exports/.test(source)) {
            throw new Error(`${label}: expected CommonJS (module.exports)`);
        }
        if (/\bexport\s+default\b/.test(source)) {
            throw new Error(`${label}: unexpected export default in CJS build`);
        }
    } else if (format === 'esm') {
        if (!/\bexport\s+default\b/.test(source)) {
            throw new Error(`${label}: expected ESM (export default)`);
        }
        if (/module\.exports/.test(source)) {
            throw new Error(`${label}: unexpected module.exports in ESM build`);
        }
    }
}
