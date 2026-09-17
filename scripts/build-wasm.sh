#!/usr/bin/env bash
# Build the OpenRV-annotation-wasm WASM artifact.
# Automatically activates a local emsdk install if present,
# otherwise expects emcmake to already be in PATH.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
EMSDK_DIR="$REPO_DIR/emsdk"
WASM_BUILD_DIR="$REPO_DIR/build-wasm"

if [[ -d "$EMSDK_DIR" ]]; then
    # shellcheck disable=SC1091
    source "$EMSDK_DIR/emsdk_env.sh" > /dev/null
elif ! command -v emcmake &> /dev/null; then
    echo "Error: Emscripten not found."
    echo "Run 'make emsdk-install' to install it locally, or install it manually"
    echo "and source emsdk_env.sh before running this script."
    exit 1
fi

emcmake cmake -B "$WASM_BUILD_DIR" -G Ninja
cmake --build "$WASM_BUILD_DIR"

echo ""
echo "Done. WASM artifacts:"
echo "  CJS: $WASM_BUILD_DIR/bindings/wasm/annotation_platform.cjs.js"
echo "  ESM: $WASM_BUILD_DIR/bindings/wasm/annotation_platform.esm.mjs"
echo "run 'npm run build' to build the package"
echo "run 'npm run test' to run the tests"
