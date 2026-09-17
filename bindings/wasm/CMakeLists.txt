# Set JS syntax targets to ~ES2017 (ES8)
# The linker runs Closure in transpile-only mode (no --closure=1) and downlevels ??, ?., etc.
set(WASM_LINK_FLAGS_COMMON
    -Os
    -lembind
    -sMODULARIZE=1
    -sEXPORT_NAME=AnnotationPlatform
    -sSINGLE_FILE=1
    -sALLOW_MEMORY_GROWTH=1
    -sENVIRONMENT=web
    -sMIN_CHROME_VERSION=58
    -sMIN_FIREFOX_VERSION=52
    -sMIN_SAFARI_VERSION=110100
    -sMIN_EDGE_VERSION=58
)

if(EMSCRIPTEN)
    # CommonJS (module.exports) — for webpack 4 / require() consumers.
    add_executable(annotation_platform_cjs StrokeBuilder.cpp)
    target_link_libraries(annotation_platform_cjs PRIVATE TwkPaint)
    set_target_properties(annotation_platform_cjs PROPERTIES
        SUFFIX ".js"
        OUTPUT_NAME "annotation_platform.cjs"
    )
    target_compile_options(annotation_platform_cjs PRIVATE -Os)
    target_link_options(annotation_platform_cjs PRIVATE ${WASM_LINK_FLAGS_COMMON})

    # ES module (export default) — for modern bundlers and dynamic import().
    add_executable(annotation_platform_esm StrokeBuilder.cpp)
    target_link_libraries(annotation_platform_esm PRIVATE TwkPaint)
    set_target_properties(annotation_platform_esm PROPERTIES
        SUFFIX ".mjs"
        OUTPUT_NAME "annotation_platform.esm"
    )
    target_compile_options(annotation_platform_esm PRIVATE -Os)
    target_link_options(annotation_platform_esm PRIVATE ${WASM_LINK_FLAGS_COMMON} -sEXPORT_ES6=1)
endif()
