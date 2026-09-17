# OpenRV-annotation-wasm

OpenRV-annotation-wasm provides WebAssembly bindings and a TypeScript-typed npm
package for [OpenRV-annotation](https://github.com/AcademySoftwareFoundation/OpenRV-annotation),
the C++ annotation geometry library. It exposes annotation path geometry, input
smoothing, and stamp placement as inputs to a renderer of your choice, via
Emscripten/Embind. Additionally GLSL shaders and brush tip PNGs are also part of the package.

## Prerequisites

- **Node.js** >= 18
- **Emscripten** (emsdk) — only required when building the WASM artifact from
  source. See [First-time setup](#first-time-setup) below.
- **CMake** >= 3.19
- **Ninja** (`brew install ninja` on macOS)
- **Clang** with `clang-format` (for C++ formatting)

## First-time setup

**1. Clone with submodules**

```bash
git clone --recurse-submodules https://github.com/AcademySoftwareFoundation/OpenRV-annotation-wasm.git
cd OpenRV-annotation-wasm
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

**2. Install Node dependencies**

```bash
make npm-install      # installs prettier and c8 into node_modules/
```

**3. Install the git pre-commit hook** *(optional but recommended)*

```bash
make install-hooks
```

The hook checks formatting on staged `.cpp`, `.h`, `.js`, and `.mjs`
files before each commit. Run `make format` to fix any issues.

**4. Install Emscripten**

```bash
make emsdk-install
```

This clones emsdk into `emsdk/` and activates the pinned version (`3.1.50`).
The `emsdk/` directory is gitignored. Run once per clone. If you already have
Emscripten installed globally it is advised not to use it, use the local `emsdk/`
to ensure JS source compatibility.

## Building

**WASM artifacts** (what browser consumers import):

```bash
make wasm
# Output:
#   build-wasm/bindings/wasm/annotation_platform.cjs.js  (CommonJS — webpack 4 / require)
#   build-wasm/bindings/wasm/annotation_platform.esm.mjs  (ES module — modern bundlers)
```

Link flags include `MIN_*_VERSION` browser targets so Emscripten transpiles modern
operators (`??`, `?.`, etc.) out of the glue code for older bundlers.

Copy into `dist/` for npm publish:

```bash
npm run build
#   dist/annotation_platform.cjs.js
#   dist/annotation_platform.esm.mjs
```

**Native build** (for local development — no Emscripten needed):

```bash
make build
```

## Running tests

```bash
npm test
```

Or via make (builds WASM first, then runs the smoke test suite):

```bash
make test
```

## Other make targets

| Target | Description |
|--------|-------------|
| `make format` | Format all C++ and JS sources in-place |
| `make format-check` | Check formatting without modifying files |
| `make coverage` | Run smoke test under c8; HTML report in `coverage/report/` |
| `make clean` | Remove build output and coverage report |

## Repo structure

```
OpenRV-annotation-wasm/
├── deps/OpenRV-annotation/ <- git submodule (C++ core: TwkPaint, TwkMath, shaders, assets)
├── bindings/wasm/
│   ├── StrokeBuilder.cpp   <- Embind wrapper (the JS-facing API)
│   └── CMakeLists.txt
├── scripts/
│   └── build-wasm.sh       <- WASM build driver (invoked by make wasm)
├── test/unit/
│   └── smoke-test.mjs      <- Node.js smoke tests
├── hooks/
│   └── pre-commit          <- shared git hook (install with make install-hooks)
├── .clang-format           <- C++ formatting rules
└── .prettierrc             <- JS formatting rules
```

## Submodule

`deps/OpenRV-annotation` points at
[OpenRV-annotation](https://github.com/AcademySoftwareFoundation/OpenRV-annotation),
the C++ geometry library (TwkPaint + TwkMath) including shared shaders and
brush assets. To update:

```bash
cd deps/OpenRV-annotation && git pull origin main && cd ../..
git add deps/OpenRV-annotation && git commit -m "Update OpenRV-annotation submodule"
```

## JS API

### StrokeBuilder

Generates triangle geometry from a sequence of input points.

```javascript
// ESM: import from dist/annotation_platform.esm.mjs (or package "import" export)
// CJS: require('@autodesk/openrv-annotation-wasm') resolves dist/annotation_platform.cjs.js
import AnnotationPlatform from './dist/annotation_platform.esm.mjs';

const Module = await AnnotationPlatform();
const stroke = new Module.StrokeBuilder();

for (const pt of paint.points) {
    stroke.addPoint(pt.x, pt.y, pt.width);
}

stroke.computeGeometry(
    Module.JoinStyle.Round,
    Module.CapStyle.Round,
    false   // soft=false for hard pen; true includes texCoords + directionalities
);

// Note: typed_memory_view returns are views into WASM heap memory.
// Copy them (new Float32Array(...)) if you need to hold data beyond the current frame.
const vertices = stroke.getVertices();  // Float32Array [x0,y0, x1,y1, ...]
const indices  = stroke.getIndices();   // Uint32Array  [i0,i1,i2, ...]

gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

stroke.clear();    // reuse for next stroke
stroke.delete();   // release WASM memory — must be called explicitly
```

### InputSmoother

Physics-based input smoother for pointer events.

```javascript
const smoother = new Module.InputSmoother();
// new Module.InputSmoother(mass, drag, iterations, smoothLevel)
//   mass        = 0.9    — how quickly the smoothed point chases the input
//   drag        = 0.921  — damping; higher = smoother but more lag
//   iterations  = 6      — sub-steps per input point
//   smoothLevel = 2      — nesting depth (1 = one pass, 2 = two passes)

canvas.addEventListener('pointermove', (e) => {
    smoother.addPoint(e.clientX, e.clientY);
    const pts = smoother.getSmoothedPoints(); // Float32Array [x0,y0, ...]
    for (let i = 0; i < pts.length; i += 2) {
        stroke.addPoint(pts[i], pts[i + 1], currentWidth);
    }
});

canvas.addEventListener('pointerup', () => {
    stroke.computeGeometry(Module.JoinStyle.Round, Module.CapStyle.Round, false);
    stroke.clear();
    smoother.reset();
});

smoother.delete();  // release WASM memory — must be called explicitly
```

### StampPlacer

Places stamp instances at arc-length intervals along a stroke path.

```javascript
const placer = new Module.StampPlacer();
// new Module.StampPlacer(radius, opacity, angle, squish,
//                        spacing, spacingBias,
//                        spacingJitter, opacityJitter, radiusJitter, rotationJitter,
//                        rotateToStroke)

canvas.addEventListener('pointermove', (e) => {
    placer.addPoint(e.clientX, e.clientY);
    const stamps = placer.getStamps(); // Float32Array [x,y,radius,opacity,angle,squish, ...]
    for (let i = 0; i < placer.getStampCount(); i++) {
        const x       = stamps[i * 6];
        const y       = stamps[i * 6 + 1];
        const radius  = stamps[i * 6 + 2];
        const opacity = stamps[i * 6 + 3];
        const angle   = stamps[i * 6 + 4];
        const squish  = stamps[i * 6 + 5];
        // ... render stamp at (x, y) ...
    }
});

canvas.addEventListener('pointerup', () => { placer.reset(); });
placer.delete();  // release WASM memory — must be called explicitly
```

### Available enums

| Enum | Values |
|---|---|
| `Module.JoinStyle` | `None`, `Bevel`, `Miter`, `Round` |
| `Module.CapStyle`  | `Flat`, `Square`, `Round` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
