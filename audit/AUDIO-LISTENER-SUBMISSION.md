# audio.cpp: validated POSIX listener fix

22 September 2026. The issue and non-draft upstream PR were both attempted and both returned HTTP 403, `Resource not accessible by integration`. Neither was created. This is the saved submission draft and evidence record.

Upstream: `0xShug0/audio.cpp`
Fork: `DivyamTalwar/audio.cpp`
Branch: `fix/http-listener-high-file-descriptors`
Base: `779714db0872cc7351d69baeaafb8bd5cf47fac7`
Tested commit: `0bcdb417f4bb0ea7be0cd8c405dea03c3e02b5a7`

Commit: https://github.com/DivyamTalwar/audio.cpp/commit/0bcdb417f4bb0ea7be0cd8c405dea03c3e02b5a7
Validation: https://github.com/DivyamTalwar/audio.cpp/actions/runs/35661284478

## Issue title

HTTP listener aborts when its POSIX socket descriptor exceeds FD_SETSIZE

## Issue body

On upstream `779714db0872cc7351d69baeaafb8bd5cf47fac7`, `wait_for_client()` in `app/server/http.cpp` still calls `FD_SET(socket, &read_set)` and `select()` on POSIX. A valid listener descriptor at or above `FD_SETSIZE` cannot fit in that fixed-size bitmap. A process that already holds enough files/sockets can therefore abort before accepting a request, despite being below its operating-system file limit.

The chunked-body path already uses `poll()`. The remaining listener limit was noted as deferred, unrelated work in #144. This report concerns only that listener path.

The focused transport test reserves `/dev/null` descriptors through 1040 before calling the real `serve_http()`. On unmodified source, ordinary descriptors permit ten HTTP exchanges and idle shutdown. High descriptors produce:

```
Listener will use a descriptor above 1040
*** bit out of range 0 - FD_SETSIZE on fd_set ***: terminated
```

This particular failure is detected by libc's fortified check before an ASan/UBSan memory-access report. The proposed POSIX `poll()` replacement passes the same ordinary/high-descriptor test modes three times each under the instrumented build.

No model weights are required. The existing `http_live_body_test` has a separate baseline failure concerning non-live chunked request handling and is left unchanged.

## PR title

fix(server): poll POSIX listeners without FD_SETSIZE bounds

## PR body

### Summary

Fix a listener crash when the process already holds enough open files for the listening socket to exceed POSIX `FD_SETSIZE`.

- Replace the POSIX listener's `FD_SET`/`select` readiness check with `poll`, retaining timeout and EINTR handling.
- Preserve the Windows handle-set implementation.
- Add a transport-only CMake target that exercises the real `serve_http()` with ordinary descriptors and with descriptors reserved through 1040 before listener creation. Each mode performs ten HTTP exchanges and checks idle shutdown.
- Serialize the two CTest invocations sharing a loopback port and explicitly skip if the OS cannot provide the required descriptor limit.

This addresses the remaining listener limitation noted as deferred work in #144. It does not change model code, inference settings, response content, or GGML backends.

### Reproduction and validation

Base: `779714db0872cc7351d69baeaafb8bd5cf47fac7`.
Tested commit: `0bcdb417f4bb0ea7be0cd8c405dea03c3e02b5a7`.
Environment: Ubuntu 24.04.5, CMake/Ninja, CPU-hosted transport test, ASan + UBSan enabled.

On unmodified production source, the ordinary-descriptor control passes. The high-descriptor mode aborts with the exact fortified FD_SET diagnostic above. With the fix, both CTest modes pass three consecutive runs, with no skips or sanitizer findings.

```sh
cmake -S . -B build/http-audit -G Ninja \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo \
  -DCMAKE_C_FLAGS_RELWITHDEBINFO='-O1 -g' \
  -DCMAKE_CXX_FLAGS_RELWITHDEBINFO='-O1 -g' \
  -DCMAKE_C_FLAGS='-fsanitize=address,undefined -fno-omit-frame-pointer' \
  -DCMAKE_CXX_FLAGS='-fsanitize=address,undefined -fno-omit-frame-pointer' \
  -DCMAKE_EXE_LINKER_FLAGS='-fsanitize=address,undefined' \
  -DBUILD_SHARED_LIBS=OFF -DENGINE_BUILD_TESTS=ON \
  -DENGINE_BUILD_EXTENDED_TESTS=ON -DAUDIOCPP_MODEL_SET=core \
  -DENGINE_ENABLE_NATIVE_CPU=OFF -DENGINE_ENABLE_METAL=OFF \
  -DENGINE_ENABLE_CUDA=OFF -DENGINE_ENABLE_VULKAN=OFF
cmake --build build/http-audit --target http_listener_test -j 4
ASAN_OPTIONS=detect_leaks=0:halt_on_error=1 \
UBSAN_OPTIONS=halt_on_error=1:print_stacktrace=1 \
ctest --test-dir build/http-audit \
  -R '^(http_listener_test|http_listener_high_fd_test)$' \
  --repeat until-fail:3 --output-on-failure
```

Validation run with exact build/runtime logs and negative-control evidence:
https://github.com/DivyamTalwar/audio.cpp/actions/runs/35661284478

`git diff --check` passes. Only `app/server/http.cpp`, the new `tests/unittests/test_http_listener.cpp`, and `CMakeLists.txt` are included. No audit workflow is included.

### Limitations and baseline note

This is actual native loopback HTTP validation, not a full model/CLI/backend regression run. No model weights are needed and no audio-quality or performance improvement is claimed. Windows, macOS, CUDA, Metal, Vulkan, and leak detection were not exercised.

The existing `http_live_body_test` independently fails on this base at its non-live chunked-body assertion: the server returns a buffered 200 response. That assertion was not modified or weakened. The listener has a separate regression target to avoid conflating these defects.

### Publication gate

Refresh upstream/main and duplicate checks before submission. Searches found the limitation described in merged #144, not an active implementation PR. The contributor's open-PR search returned zero before this attempted submission. The contribution guide limits contributors to three simultaneous open PRs, including drafts; preserve that limit when publishing this and future fixes.

Do not invent an issue number or treat this saved draft as an upstream PR.
