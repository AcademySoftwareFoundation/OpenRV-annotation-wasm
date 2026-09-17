/**
 * Shared runtime smoke tests for the AnnotationPlatform WASM module.
 * @param {import('../../annotation_platform.d.ts').default extends () => Promise<infer M> ? M : never} Module
 */
export function runWasmSmokeTests(Module) {
    let passed = 0;
    let failed = 0;

    function check(name, condition) {
        if (condition) {
            console.log(`  ✓ ${name}`);
            passed++;
        } else {
            console.error(`  ✗ ${name}`);
            failed++;
        }
    }

    function section(title) {
        console.log(`\n${title}:`);
    }

    function indicesInBounds(vertices, indices) {
        const nVerts = vertices.length / 2;
        for (let i = 0; i < indices.length; i++) {
            if (indices[i] >= nVerts) return false;
        }
        return true;
    }

    function bbox(verts) {
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (let i = 0; i < verts.length; i += 2) {
            minX = Math.min(minX, verts[i]);
            maxX = Math.max(maxX, verts[i]);
            minY = Math.min(minY, verts[i + 1]);
            maxY = Math.max(maxY, verts[i + 1]);
        }
        return { minX, minY, maxX, maxY };
    }

    section('Enums');
    check('JoinStyle.None exists', Module.JoinStyle.None !== undefined);
    check('JoinStyle.Bevel exists', Module.JoinStyle.Bevel !== undefined);
    check('JoinStyle.Miter exists', Module.JoinStyle.Miter !== undefined);
    check('JoinStyle.Round exists', Module.JoinStyle.Round !== undefined);
    check('CapStyle.Flat exists', Module.CapStyle.Flat !== undefined);
    check('CapStyle.Square exists', Module.CapStyle.Square !== undefined);
    check('CapStyle.Round exists', Module.CapStyle.Round !== undefined);

    section('StrokeBuilder output types (3 points, round join/cap)');
    const stroke = new Module.StrokeBuilder();
    stroke.addPoint(0.0, 0.0, 0.01);
    stroke.addPoint(0.5, 0.5, 0.01);
    stroke.addPoint(1.0, 0.0, 0.01);
    stroke.computeGeometry(Module.JoinStyle.Round, Module.CapStyle.Round, false);

    const verts = stroke.getVertices();
    const indices = stroke.getIndices();
    const texCoords = stroke.getTexCoords();
    check('vertices is Float32Array', verts instanceof Float32Array);
    check('indices is Uint32Array', indices instanceof Uint32Array);
    check('texCoords is Float32Array', texCoords instanceof Float32Array);
    check('vertex count > 0', verts.length > 0);
    check('vertex count is even (x,y pairs)', verts.length % 2 === 0);
    check('index count > 0', indices.length > 0);
    check('index count divisible by 3', indices.length % 3 === 0);
    check('texCoords length matches vertices', texCoords.length === verts.length);
    check('all indices within vertex bounds', indicesInBounds(verts, indices));

    section('StrokeBuilder: all join × cap combinations');
    const joinStyles = ['None', 'Bevel', 'Miter', 'Round'];
    const capStyles = ['Flat', 'Square', 'Round'];
    for (const joinName of joinStyles) {
        for (const capName of capStyles) {
            stroke.clear();
            stroke.addPoint(0.0, 0.0, 0.01);
            stroke.addPoint(0.5, 0.5, 0.01);
            stroke.addPoint(1.0, 0.0, 0.01);
            stroke.computeGeometry(Module.JoinStyle[joinName], Module.CapStyle[capName], false);
            const v = stroke.getVertices();
            const idx = stroke.getIndices();
            check(`${joinName}/${capName}: non-empty output`, v.length > 0 && idx.length > 0);
            check(`${joinName}/${capName}: indices within bounds`, indicesInBounds(v, idx));
            check(`${joinName}/${capName}: index count divisible by 3`, idx.length % 3 === 0);
        }
    }

    section('StrokeBuilder: vertex bounding box');
    stroke.clear();
    stroke.addPoint(0.1, 0.2, 0.01);
    stroke.addPoint(0.5, 0.8, 0.01);
    stroke.addPoint(0.9, 0.2, 0.01);
    stroke.computeGeometry(Module.JoinStyle.Round, Module.CapStyle.Round, false);
    {
        const b = bbox(stroke.getVertices());
        const margin = 0.05;
        check('vertices within expected x range', b.minX >= 0.1 - margin && b.maxX <= 0.9 + margin);
        check('vertices within expected y range', b.minY >= 0.2 - margin && b.maxY <= 0.8 + margin);
    }

    section('StrokeBuilder: edge cases');
    stroke.clear();
    stroke.addPoint(0.0, 0.0, 0.01);
    stroke.computeGeometry(Module.JoinStyle.Round, Module.CapStyle.Round, false);
    check('single point: produces stamp geometry', stroke.getVertices().length > 0);
    check('single point: indices valid', stroke.getIndices().length % 3 === 0);

    stroke.clear();
    stroke.addPoint(0.0, 0.0, 0.01);
    stroke.addPoint(1.0, 0.0, 0.01);
    stroke.computeGeometry(Module.JoinStyle.Round, Module.CapStyle.Round, false);
    check('two points: produces geometry', stroke.getVertices().length > 0);

    stroke.clear();
    const N = 30;
    for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        stroke.addPoint(t, 0.5 * Math.sin(t * Math.PI * 2), 0.01);
    }
    stroke.computeGeometry(Module.JoinStyle.Round, Module.CapStyle.Round, false);
    const manyVerts = stroke.getVertices();
    const manyIdx = stroke.getIndices();
    check('many points: non-empty geometry', manyVerts.length > 0);
    check('many points: indices within bounds', indicesInBounds(manyVerts, manyIdx));

    section('StrokeBuilder: soft pen');
    stroke.clear();
    stroke.addPoint(0.0, 0.0, 0.01);
    stroke.addPoint(0.5, 0.5, 0.01);
    stroke.addPoint(1.0, 0.0, 0.01);
    stroke.computeGeometry(Module.JoinStyle.Round, Module.CapStyle.Round, true);
    {
        const dirs = stroke.getDirectionalities();
        check('directionalities non-empty for soft pen', dirs.length > 0);
        check(
            'directionalities length matches vertices',
            dirs.length * 2 === stroke.getVertices().length,
        );
        const allFinite = Array.from(dirs).every((v) => isFinite(v));
        check('directionalities are all finite', allFinite);
    }

    section('StrokeBuilder: clear()');
    stroke.clear();
    stroke.computeGeometry(Module.JoinStyle.Round, Module.CapStyle.Round, false);
    check('after clear(), vertices are empty', stroke.getVertices().length === 0);
    check('after clear(), indices are empty', stroke.getIndices().length === 0);

    section('InputSmoother: default params');
    const smoother = new Module.InputSmoother();
    smoother.addPoint(0.0, 0.0);
    const pts0 = smoother.getSmoothedPoints();
    check('getSmoothedPoints() returns Float32Array', pts0 instanceof Float32Array);
    check('first point yields 0 smoothed samples (cold-start)', pts0.length === 0);

    smoother.addPoint(0.1, 0.1);
    smoother.addPoint(0.2, 0.2);
    smoother.addPoint(0.3, 0.3);
    smoother.addPoint(0.4, 0.4);
    smoother.addPoint(0.5, 0.5);
    const pts5 = smoother.getSmoothedPoints();
    check('multiple points: smoothed output non-empty', pts5.length > 0);
    check('smoothed point count is even (x,y pairs)', pts5.length % 2 === 0);
    check(
        'smoothed values are all finite',
        Array.from(pts5).every((v) => isFinite(v)),
    );
    check(
        'smoothed values are in expected range (0..0.7)',
        Array.from(pts5).every((v) => v >= -0.1 && v <= 0.7),
    );
    console.log(`  (${pts5.length / 2} smoothed points from last addPoint)`);

    section('InputSmoother: reset()');
    smoother.reset();
    smoother.addPoint(1.0, 1.0);
    check(
        'after reset, first point again yields 0 samples',
        smoother.getSmoothedPoints().length === 0,
    );
    smoother.addPoint(1.1, 1.1);
    check('after reset, second point produces output', smoother.getSmoothedPoints().length > 0);

    section('InputSmoother: custom params');
    const smootherCustom = new Module.InputSmoother(0.8, 0.9, 4, 1);
    smootherCustom.addPoint(0.0, 0.0);
    smootherCustom.addPoint(1.0, 1.0);
    smootherCustom.addPoint(2.0, 0.0);
    const ptsCustom = smootherCustom.getSmoothedPoints();
    check('custom-param smoother produces output', ptsCustom.length > 0);
    check(
        'custom-param output values are all finite',
        Array.from(ptsCustom).every((v) => isFinite(v)),
    );
    smootherCustom.delete();

    section('StampPlacer: default params');
    const placer = new Module.StampPlacer();

    placer.addPoint(0.0, 0.0);
    check('first point yields no stamps (cold start)', placer.getStampCount() === 0);

    placer.addPoint(1.0, 0.0, -1, -1, -1, -1);
    const stamps0 = placer.getStamps();
    check('getStamps() returns Float32Array', stamps0 instanceof Float32Array);
    check('stamps produced on second point', placer.getStampCount() > 0);
    check(
        'getStamps() length is 6 × getStampCount()',
        stamps0.length === placer.getStampCount() * 6,
    );
    check(
        'stamp values are all finite',
        Array.from(stamps0).every((v) => isFinite(v)),
    );
    check(
        'stamp x positions lie along segment [0..1]',
        Array.from({ length: placer.getStampCount() }, (_, i) => stamps0[i * 6]).every(
            (x) => x >= -0.01 && x <= 1.01,
        ),
    );
    check(
        'stamp y positions are ~0 (horizontal segment)',
        Array.from({ length: placer.getStampCount() }, (_, i) => stamps0[i * 6 + 1]).every(
            (y) => Math.abs(y) < 1e-4,
        ),
    );

    section('StampPlacer: reset()');
    placer.reset();
    placer.addPoint(0.0, 0.0);
    check('after reset, first point again yields no stamps', placer.getStampCount() === 0);
    placer.addPoint(1.0, 0.0, -1, -1, -1, -1);
    check('after reset, second point produces stamps', placer.getStampCount() > 0);

    section('StampPlacer: custom params');
    const placerCustom = new Module.StampPlacer(
        0.05,
        0.8,
        0.0,
        1.0,
        0.1,
        1.0,
        0.0,
        0.0,
        0.0,
        0.0,
        false,
    );
    placerCustom.addPoint(0.0, 0.0);
    placerCustom.addPoint(1.0, 0.0, -1, -1, -1, -1);
    const stampsCustom = placerCustom.getStamps();
    check('custom-param placer produces stamps', placerCustom.getStampCount() > 0);
    check(
        'custom stamp radii match param',
        Array.from(
            { length: placerCustom.getStampCount() },
            (_, i) => stampsCustom[i * 6 + 2],
        ).every((r) => Math.abs(r - 0.05) < 1e-5),
    );
    check(
        'custom stamp opacities match param',
        Array.from(
            { length: placerCustom.getStampCount() },
            (_, i) => stampsCustom[i * 6 + 3],
        ).every((o) => Math.abs(o - 0.8) < 1e-5),
    );
    placerCustom.delete();

    section('Memory management');
    placer.delete();
    check('placer.delete() does not throw', true);
    smoother.delete();
    check('smoother.delete() does not throw', true);
    stroke.delete();
    check('stroke.delete() does not throw', true);

    return { passed, failed };
}
