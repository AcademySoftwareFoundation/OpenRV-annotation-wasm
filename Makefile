SHELL := bash
.PHONY: all configure build clean wasm emsdk-install test \
        npm-install format format-check coverage install-hooks

BUILD_DIR      := build
WASM_BUILD_DIR := build-wasm
EMSDK_DIR      := emsdk
EMSDK_VERSION  := 3.1.50 # needs to be the same as in ci.yml

# Sentinel file so npm-install only reruns when package.json changes.
NODE_SENTINEL  := node_modules/.package-lock.json

CPP_SOURCES    := $(shell find bindings -name '*.cpp' -o -name '*.h')
JS_SOURCES     := $(shell find test -name '*.js' -o -name '*.mjs')
TS_SOURCES     := $(shell find . -name '*.ts' -not -path './node_modules/*' -not -path './emsdk/*')

# ── Native build (development / CI) ──────────────────────────────────────────

all: build

configure:
	cmake -B $(BUILD_DIR) -G Ninja

build: configure
	cmake --build $(BUILD_DIR)

clean:
	rm -rf $(BUILD_DIR) $(WASM_BUILD_DIR) coverage/report/

# ── Emscripten setup ─────────────────────────────────────────────────────────

emsdk-install:
	@if [ ! -d "$(EMSDK_DIR)" ]; then \
		git clone https://github.com/emscripten-core/emsdk.git $(EMSDK_DIR); \
	else \
		echo "emsdk already cloned, updating..."; \
		git -C $(EMSDK_DIR) pull; \
	fi
	cd $(EMSDK_DIR) && ./emsdk install $(EMSDK_VERSION) && ./emsdk activate $(EMSDK_VERSION)
	@echo ""
	@echo "Emscripten $(EMSDK_VERSION) installed. You can now run: make wasm"

# ── WASM build ────────────────────────────────────────────────────────────────
# Activates emsdk automatically if installed locally via 'make emsdk-install'.
# Alternatively, source your own emsdk_env.sh before running this target.

wasm:
	./scripts/build-wasm.sh

test: wasm
	node test/unit/smoke-test.mjs

# ── Node / npm ────────────────────────────────────────────────────────────────

npm-install: $(NODE_SENTINEL)

$(NODE_SENTINEL): package.json
	npm install
	touch $(NODE_SENTINEL)

# ── Formatting ────────────────────────────────────────────────────────────────

format: npm-install
	clang-format -i $(CPP_SOURCES)
	npx prettier --write $(JS_SOURCES) $(TS_SOURCES)

format-check: npm-install
	clang-format --dry-run --Werror $(CPP_SOURCES)
	npx prettier --check $(JS_SOURCES) $(TS_SOURCES)

# ── Coverage ──────────────────────────────────────────────────────────────────
# Runs the smoke test under c8 and writes an HTML report to coverage/report/.
# WASM internals are covered by OpenRV-annotation's own test suite.

coverage: npm-install wasm
	mkdir -p coverage/report
	npx c8 --reporter=html --reporter=text \
	    --report-dir=coverage/report \
	    node test/unit/smoke-test.mjs

# ── Git hooks ─────────────────────────────────────────────────────────────────

install-hooks:
	ln -sf ../../hooks/pre-commit .git/hooks/pre-commit
	@echo "pre-commit hook installed."
