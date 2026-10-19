#include <TwkMath/Hash.h>
#include <TwkPaint/Path.h>
#include <TwkPaint/Smoother.h>
#include <TwkPaint/StampPath.h>
#include <cstdint>
#include <emscripten/bind.h>
#include <optional>
#include <string>
#include <vector>

using namespace emscripten;
using namespace TwkPaint;

class StrokeBuilder
{
  public:
    void addPoint(float x, float y, float width) { m_path.add(Point(x, y), width); }

    void clear()
    {
        m_path.clear();
        m_indices.clear();
    }

    void computeGeometry(Path::JoinStyle join, Path::CapStyle cap, bool soft)
    {
        Path::TextureStyle tex = soft ? Path::RadiallySymmetric : Path::NoTexture;
        m_path.computeGeometry(join, cap, tex, Path::QualityAlgorithm, /*smooth=*/true);

        // Flatten IndexTriangleArray (Vec3<size_t>) to a flat uint32_t list for WebGL
        m_indices.clear();
        for (const auto& tri : m_path.outputTriangles())
        {
            m_indices.push_back(static_cast<uint32_t>(tri[0]));
            m_indices.push_back(static_cast<uint32_t>(tri[1]));
            m_indices.push_back(static_cast<uint32_t>(tri[2]));
        }
    }

    // Float32Array view: [x0,y0, x1,y1, ...]
    // Valid until the next computeGeometry() or clear() call.
    val getVertices() const
    {
        const auto& pts = m_path.outputPoints();
        return val(typed_memory_view(pts.size() * 2, reinterpret_cast<const float*>(pts.data())));
    }

    // Uint32Array view: [i0,i1,i2, ...]
    val getIndices() const { return val(typed_memory_view(m_indices.size(), m_indices.data())); }

    // Float32Array view: [s0,t0, s1,t1, ...] — meaningful only when soft=true
    val getTexCoords() const
    {
        const auto& tc = m_path.outputTexCoords();
        return val(typed_memory_view(tc.size() * 2, reinterpret_cast<const float*>(tc.data())));
    }

    // Float32Array view: [d0, d1, ...] — meaningful only when soft=true
    val getDirectionalities() const
    {
        const auto& d = m_path.outputDirectionalities();
        return val(typed_memory_view(d.size(), d.data()));
    }

  private:
    Path m_path;
    std::vector<uint32_t> m_indices;
};

// ── InputSmoother ─────────────────────────────────────────────────────────────
//
// Physics-based input smoother. Feed raw pointer events in via addPoint();
// getSmoothedPoints() returns the smoothed output from that call as a
// Float32Array [x0,y0, x1,y1, ...].
//
// Call reset() between strokes so the physics state (velocity/acceleration)
// doesn't bleed from one stroke into the next.
//
class InputSmoother
{
  public:
    explicit InputSmoother(float mass = 0.9f, float drag = 0.921f, int iterations = 6,
                           int smoothLevel = 2)
        : m_mass(mass)
        , m_drag(drag)
        , m_iterations(iterations)
        , m_smoothLevel(static_cast<unsigned int>(smoothLevel))
        , m_smoother(new TwkPaint::SmoothInterpolate2D(mass, drag, iterations,
                                                       static_cast<unsigned int>(smoothLevel)))
    {}

    // Feed one raw input point. Drains all generated smoothed samples
    // into the internal buffer — retrieve them via getSmoothedPoints().
    void addPoint(float x, float y)
    {
        m_output.clear();
        m_smoother->add_point(TwkMath::Vec2f(x, y));
        TwkMath::Vec2f pt;
        while (m_smoother->interpolate(pt))
        {
            m_output.push_back(pt.x);
            m_output.push_back(pt.y);
        }
    }

    // Float32Array view: [x0,y0, x1,y1, ...]
    // Valid until the next addPoint() or reset() call.
    val getSmoothedPoints() const
    {
        return val(typed_memory_view(m_output.size(), m_output.data()));
    }

    // Reset physics state for the start of a new stroke.
    void reset()
    {
        m_smoother.reset(
            new TwkPaint::SmoothInterpolate2D(m_mass, m_drag, m_iterations, m_smoothLevel));
        m_output.clear();
    }

  private:
    float m_mass;
    float m_drag;
    int m_iterations;
    unsigned int m_smoothLevel;

    std::unique_ptr<TwkPaint::SmoothInterpolate2D> m_smoother;
    std::vector<float> m_output;
};

// ── StampPlacer ───────────────────────────────────────────────────────────────
//
// Stamp placement geometry. Feed smoothed pointer events via addPoint();
// the placer emits StampInstance placements at arc-length intervals along
// the stroke. Retrieve placements via getStamps() after each addPoint().
//
// Returned Float32Array layout (per stamp, 6 floats):
//   [x, y, radius, opacity, angle, squish, ...]
//
// Call reset() between strokes.
//
class StampPlacer
{
  public:
    // Default construction uses BrushParams defaults.
    StampPlacer()
        : m_placer(TwkPaint::BrushParams{})
    {}

    explicit StampPlacer(float radius, float opacity, float angle, float squish,
                         float spacing, // pass 0 to use default spacing
                         float spacingBias, float spacingJitter, float opacityJitter,
                         float radiusJitter, float rotationJitter, bool rotateToStroke)
        : m_placer(makeParams(radius, opacity, angle, squish, spacing, spacingBias, spacingJitter,
                              opacityJitter, radiusJitter, rotationJitter, rotateToStroke))
    {}

    explicit StampPlacer(float radius, float opacity, float angle, float squish, float spacing,
                         float spacingBias, float spacingJitter, float opacityJitter,
                         float radiusJitter, float rotationJitter, bool rotateToStroke,
                         uint32_t seed)
        : m_placer(makeParams(radius, opacity, angle, squish, spacing, spacingBias, spacingJitter,
                              opacityJitter, radiusJitter, rotationJitter, rotateToStroke, seed))
    {}

    // Feed one (smoothed) input point, optionally with per-point overrides.
    // Pass -1 for any override to use the BrushParams default.
    void addPoint(float x, float y, float radius = -1.f, float opacity = -1.f, float angle = -1.f,
                  float squish = -1.f)
    {
        m_output.clear();
        m_placer.add_point(TwkMath::Vec2f(x, y), radius, opacity, angle, squish);
        TwkPaint::StampInstance s;
        while (m_placer.next(s))
        {
            m_output.push_back(s.pos.x);
            m_output.push_back(s.pos.y);
            m_output.push_back(s.radius);
            m_output.push_back(s.opacity);
            m_output.push_back(s.angle);
            m_output.push_back(s.squish);
        }
    }

    // Float32Array view: [x,y,radius,opacity,angle,squish, ...]  (6 floats per stamp)
    // Valid until the next addPoint() or reset() call.
    val getStamps() const { return val(typed_memory_view(m_output.size(), m_output.data())); }

    int getStampCount() const { return static_cast<int>(m_output.size() / 6); }

    void reset()
    {
        m_placer.reset();
        m_output.clear();
    }

    void reset(float radius, float opacity, float angle, float squish, float spacing,
               float spacingBias, float spacingJitter, float opacityJitter, float radiusJitter,
               float rotationJitter, bool rotateToStroke)
    {
        m_placer.reset(makeParams(radius, opacity, angle, squish, spacing, spacingBias,
                                  spacingJitter, opacityJitter, radiusJitter, rotationJitter,
                                  rotateToStroke));
        m_output.clear();
    }

    void reset(float radius, float opacity, float angle, float squish, float spacing,
               float spacingBias, float spacingJitter, float opacityJitter, float radiusJitter,
               float rotationJitter, bool rotateToStroke, uint32_t seed)
    {
        m_placer.reset(makeParams(radius, opacity, angle, squish, spacing, spacingBias,
                                  spacingJitter, opacityJitter, radiusJitter, rotationJitter,
                                  rotateToStroke, seed));
        m_output.clear();
    }

  private:
    static TwkPaint::BrushParams makeParams(float radius, float opacity, float angle, float squish,
                                            float spacing, float spacingBias, float spacingJitter,
                                            float opacityJitter, float radiusJitter,
                                            float rotationJitter, bool rotateToStroke,
                                            std::optional<uint32_t> seed = std::nullopt)
    {
        TwkPaint::BrushParams p;
        p.radius         = radius;
        p.opacity        = opacity;
        p.angle          = angle;
        p.squish         = squish;
        p.spacing        = spacing;
        p.spacingBias    = spacingBias;
        p.spacingJitter  = spacingJitter;
        p.opacityJitter  = opacityJitter;
        p.radiusJitter   = radiusJitter;
        p.rotationJitter = rotationJitter;
        p.rotateToStroke = rotateToStroke;
        p.seed           = seed;
        return p;
    }

    TwkPaint::StampPath m_placer;
    std::vector<float> m_output;
};

// FNV-1a 32-bit hash of @a id. Stable across platforms/processes — useful
// for deriving a deterministic StampPlacer seed from a string identifier
// (e.g. an OTIO Paint.2 uuid), so jitter is reproducible across re-renders.
uint32_t hashU32(const std::string& id)
{
    return TwkMath::hash_u32(id);
}

EMSCRIPTEN_BINDINGS(annotation_platform)
{
    enum_<Path::JoinStyle>("JoinStyle")
        .value("None", Path::NoJoin)
        .value("Bevel", Path::BevelJoin)
        .value("Miter", Path::MiterJoin)
        .value("Round", Path::RoundJoin);

    enum_<Path::CapStyle>("CapStyle")
        .value("Flat", Path::FlatCap)
        .value("Square", Path::SquareCap)
        .value("Round", Path::RoundCap);

    class_<StrokeBuilder>("StrokeBuilder")
        .constructor<>()
        .function("addPoint", &StrokeBuilder::addPoint)
        .function("clear", &StrokeBuilder::clear)
        .function("computeGeometry", &StrokeBuilder::computeGeometry)
        .function("getVertices", &StrokeBuilder::getVertices)
        .function("getIndices", &StrokeBuilder::getIndices)
        .function("getTexCoords", &StrokeBuilder::getTexCoords)
        .function("getDirectionalities", &StrokeBuilder::getDirectionalities);

    class_<InputSmoother>("InputSmoother")
        .constructor<>()
        .constructor<float, float, int, int>()
        .function("addPoint", &InputSmoother::addPoint)
        .function("getSmoothedPoints", &InputSmoother::getSmoothedPoints)
        .function("reset", &InputSmoother::reset);

    class_<StampPlacer>("StampPlacer")
        .constructor<>()
        .constructor<float, float, float, float, float, float, float, float, float, float, bool>()
        .constructor<float, float, float, float, float, float, float, float, float, float, bool,
                     uint32_t>()
        .function("addPoint", optional_override(
                                  [](StampPlacer& self, float x, float y) { self.addPoint(x, y); }))
        .function("addPoint", &StampPlacer::addPoint)
        .function("getStamps", &StampPlacer::getStamps)
        .function("getStampCount", &StampPlacer::getStampCount)
        .function("reset", select_overload<void()>(&StampPlacer::reset))
        .function("reset", select_overload<void(float, float, float, float, float, float, float,
                                                float, float, float, bool)>(&StampPlacer::reset))
        .function("reset",
                  select_overload<void(float, float, float, float, float, float, float, float,
                                       float, float, bool, uint32_t)>(&StampPlacer::reset));

    function("hashU32", &hashU32);
}
