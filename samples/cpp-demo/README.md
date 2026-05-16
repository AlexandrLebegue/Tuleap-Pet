# cpp-demo

Minimal C++17 project used as a fixture for the Tuleap AI Companion features
`TestGenerator` and `Commenter`.

## Layout

- `src/calculator.{h,cpp}` — small numeric library with an intentional call
  chain (`average` -> `sum` -> `add`, `square` -> `multiply`, `max_element`).
  Useful to exercise the static call-graph analyzer.
- `src/strutil.{h,cpp}` — string utilities, **already fully documented** in
  the project's Doxygen style. Used to validate that the Commenter skips
  functions whose existing comments are sufficient.
- `tests/test_calculator.cpp` — seed GoogleTest file showing the project's
  test conventions (gtest + gtest_main, no hand-written `main`).
- `CMakePresets.json` — exposes `ci-gcc` (Ninja + g++) and `ci-msvc` workflow
  presets. Each workflow runs configure → build → test.

## Build

```bash
cmake --workflow --preset ci-gcc       # Linux/macOS
cmake --workflow --preset ci-msvc      # Windows (VS 2022)
```

The first run fetches GoogleTest v1.14.0 via `FetchContent` and caches it
under `build/ci-gcc/_deps/`.
