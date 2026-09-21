# Validated contribution status

**22 September 2026 (Asia/Kolkata).** This status supersedes the preliminary counts in SUBMISSIONS.md.

## Outcome

- Requested campaign: **25 upstream PRs** across Hivemind and audio.cpp.
- Saved independently scoped, implemented and tested fixes: **5** (4 Hivemind, 1 audio.cpp).
- New upstream issues created by these attempts: **0**.
- New upstream PRs created by these attempts: **0**.
- Both issue creation and non-draft PR creation were attempted against both upstream repositories. Each returned HTTP 403: `Resource not accessible by integration`.
- Both forks accept branch/file writes. Neither fork's main branch nor either upstream main branch was modified by this work. No release version was bumped.
- The 25-PR objective is **not complete**. No untested candidates, audit branches, or fork-local PRs are counted as upstream contributions.

## Saved clean fix branches

| Repository | Fix | Branch | Tested commit | Independent verification |
| --- | --- | --- | --- | --- |
| DivyamTalwar/hivemind | Cowork silently skips a record observed mid-write | `fix/cowork-partial-transcript-records` | `75b015c80a67bba0e22083bf2aebcf70c1470de2` | 2 negative controls fail on unmodified source; 2 compatibility controls pass. Fixed: 60 affected tests; 5,853 full-suite tests; build/typecheck/coverage pass. |
| DivyamTalwar/hivemind | Inflight recovery loses rows by joining them to an unterminated queue tail | `fix/session-queue-recovery-boundaries` | `728aa7de466e51ba05174eb5ec7e92576456a48b` | 3 regressions fail on unmodified source; 2 controls pass. Fixed: 48 affected tests; 5,854 full-suite tests; build/typecheck/duplication/coverage pass. |
| DivyamTalwar/hivemind | Private document store inherits overly broad POSIX permissions | `fix/private-doc-store-permissions` | `677e122f085a24c51056e3ae117679b9c2372624` | 3 regressions fail on unmodified source; 5,852 full-suite tests pass on the fix, including coverage. |
| DivyamTalwar/hivemind | Async embedding-daemon launch error escapes the standalone client | `fix/standalone-embed-spawn-errors` | `53a38ccdf74e6ebf0b6240b4fc58272ffc2d410e` | 1 regression fails on unmodified source; 5,850 full-suite tests pass on the fix, including coverage. |
| DivyamTalwar/audio.cpp | High POSIX socket descriptor aborts the HTTP listener | `fix/http-listener-high-file-descriptors` | `0bcdb417f4bb0ea7be0cd8c405dea03c3e02b5a7` | Ordinary-descriptor baseline passes; high-descriptor baseline aborts at the fortified FD_SET check. Fixed: both actual native HTTP modes pass 3 repetitions under ASan/UBSan, with no skips. |

The private-store and standalone-daemon branches were recovered from earlier prepared work and freshly revalidated; they are not represented as newly authored during the continuation. Audit controllers and workflows are excluded from every clean fix branch.

### Direct commits

- Cowork: https://github.com/DivyamTalwar/hivemind/commit/75b015c80a67bba0e22083bf2aebcf70c1470de2
- Queue recovery: https://github.com/DivyamTalwar/hivemind/commit/728aa7de466e51ba05174eb5ec7e92576456a48b
- Private storage: https://github.com/DivyamTalwar/hivemind/commit/677e122f085a24c51056e3ae117679b9c2372624
- Spawn error: https://github.com/DivyamTalwar/hivemind/commit/53a38ccdf74e6ebf0b6240b4fc58272ffc2d410e
- HTTP listener: https://github.com/DivyamTalwar/audio.cpp/commit/0bcdb417f4bb0ea7be0cd8c405dea03c3e02b5a7

## Combined Hivemind verification

All four independent commits were cherry-picked into an isolated CI checkout without changing their branch histories:

**5,862 tests passed; 0 failed; 0 pending.**

Typecheck, build, duplication guard, diff whitespace check, and coverage thresholds passed. Coverage: statements 90.84%; branches 84.07%; functions 91.62%; lines 92.86%. These are whole-suite metrics, not a claim of complete coverage for every changed line.

The critical-only OpenClaw bundle audit passed with **0 critical findings and 4 advisory warnings**. It was not a warning-free security audit.

Environment: Ubuntu 24.04.5 / Node 22.23.2.

Evidence runs:
- Cowork independent: https://github.com/DivyamTalwar/hivemind/actions/runs/35658015441
- Queue recovery independent: https://github.com/DivyamTalwar/hivemind/actions/runs/35659098663
- Two capture fixes combined: https://github.com/DivyamTalwar/hivemind/actions/runs/35659367358
- Private/spawn independent and all four combined: https://github.com/DivyamTalwar/hivemind/actions/runs/35660567156
- Audio native listener negative control and fixed repetitions: https://github.com/DivyamTalwar/audio.cpp/actions/runs/35661284478

These runs include downloadable evidence artifacts with finite retention. The commit refs, commands, scope, and result summaries are recorded persistently here and in the submission drafts.

## Testing boundaries and rejected candidates

Hivemind regressions exercise production functions and real temporary files, but use mocked upload clients or injected child processes where appropriate. No claim is made of live Deep Lake, Claude Desktop UI, Windows ACL, or actual OS process-exhaustion validation.

Audio validation builds the dedicated CMake transport target and makes actual loopback HTTP requests. It does not run model inference, a full CLI build, Windows/macOS, GPU backends, or leak detection. The baseline crash is the libc fortified FD_SET abort, not a fabricated ASan stack trace.

The existing `http_live_body_test` has an independent baseline assertion failure about non-live chunked request handling. It was left unchanged. The listener has a focused test rather than weakened old assertions.

A proposed fixed-Content-Length truncation bug was excluded because current source already rejects truncated bodies. The first queue-recovery patch's unconditional newline was rejected by existing queue-growth/ceiling tests; the committed conditional-separator version passes those tests unchanged.

## Contribution and duplication checks

Reviewed contribution instructions and Hivemind's PR template. Searched relevant existing PRs and issues before selecting/submitting work. The Cowork fix is distinct from #343 and #363; queue recovery retains the append-based design discussed in #61. The broad open security PR #270's complete changed-file list does not include private-store.ts or standalone-embed-client.ts. The audio listener limitation was documented as deferred in merged #144.

Refresh duplicate/ownership checks and upstream refs before eventual publication. Do not claim assignment to an existing issue or add fictitious issue numbers. audio.cpp limits each contributor to **3 simultaneous open PRs, including drafts**; the attempted first submission was within that limit.

## Submission drafts

- [Cowork and queue recovery](SUBMISSIONS.md)
- [Private storage and asynchronous daemon errors](ADDITIONAL-SUBMISSIONS.md)
- [Native HTTP listener](AUDIO-LISTENER-SUBMISSION.md)

These contain problem statements, scope, exact tested commits, reproduction/validation commands, limitations, and professional upstream PR bodies. They are drafts because publishing was denied, not because the clean branches are draft pull requests.

## Required access to publish

Remote Desktop Commander reported no connected device, and the GitHub integration denied upstream issue/PR writes. Restore an authorized upstream publishing connection, or reconnect the already authorized Desktop Commander computer with the user's own GitHub CLI signed in. Do not paste credentials into chat, expose tokens in logs, or attempt to bypass the integration's denial with an Actions token.
