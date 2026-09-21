# Contribution submission pack

Updated: 22 September 2026 (Asia/Kolkata).

## Actual status

The requested target is 25 upstream pull requests across `activeloopai/hivemind` and `0xShug0/audio.cpp`. This pack does **not** represent 25 completed PRs.

Two Hivemind fixes are implemented, regression-tested, and committed on independent fork branches. Upstream issue and PR creation were attempted for the first fix, and both returned HTTP 403, `Resource not accessible by integration`. **No upstream issue or PR was created.** No fork-local PR is being substituted for an upstream contribution.

The repository's `main` branch was not changed. Audit controllers/workflows are excluded from both fix branches. No release version was bumped.

| Fix | Fork branch | Tested commit | Validation |
| --- | --- | --- | --- |
| Cowork split-write record loss | `fix/cowork-partial-transcript-records` | `75b015c80a67bba0e22083bf2aebcf70c1470de2` | [Run](https://github.com/DivyamTalwar/hivemind/actions/runs/35658015441): 60 affected tests; 5,853 full-suite tests; typecheck/build/coverage passed |
| Inflight recovery record boundaries | `fix/session-queue-recovery-boundaries` | `728aa7de466e51ba05174eb5ec7e92576456a48b` | [Run](https://github.com/DivyamTalwar/hivemind/actions/runs/35659098663): 48 affected tests; 5,854 full-suite tests; typecheck/build/duplication/coverage passed |

Both were tested on Ubuntu 24.04 / Node 22.23.2. These are real filesystem and production-function tests with mocked upload clients, not a claim of live Deep Lake account or Claude Desktop UI validation. The second run's OpenClaw bundle audit passed its critical-only gate, with 0 critical and 4 advisory warnings; it was not a warning-free security audit.

A combined validation workflow is also recorded on `audit/combined-capture-validation-20260922`. Its outcome must be checked separately before claiming combined success.

For audio.cpp, an additional native listener regression is undergoing sanitizer validation on `DivyamTalwar/audio.cpp:audit/http-listener-20260922`. It is not counted as complete here. Its contribution guide requires actual runtime evidence and no more than **3 simultaneous open PRs**, including drafts.

## Submission order and duplicate checks

Before publishing, refresh upstream main and open/closed PR searches. Do not claim maintainer assignment or post a pickup comment on an issue already owned by another contributor.

The Cowork split-write fix is distinct from #343's upload-failure replay correction and #363's redaction-before-serialization work. The queue-recovery fix retains #61's append-based recovery rather than restoring its old destructive rename behavior.

Use the repository PR template (Summary, Version Bump, Test plan). Create an issue with the corresponding draft below, then link its actual number from the PR. These are newly reproduced defects, not claims on an existing issue. Do not insert fictitious issue numbers.

---

# Submission 1

## Issue title

Cowork ingestion permanently skips a JSONL record observed mid-write

## Issue body

### Reproduced on

`main` at `ce30de7ca94115cb73fa991538c6d2595ac2622a` (`0.7.159`). Reproduced with the real `ingestCoworkSessions()` and temporary transcript, queue, and state files; the upload client is mocked offline so local capture can be inspected independently.

### Problem

`src/mcp/cowork-ingest.ts` increments `processed` for every `JSON.parse` failure, including an unterminated final record that the writer has not finished appending. That progress is persisted. Completing the same line on a later tick does not add another line index, so the now-valid event is permanently skipped.

This is separate from the upload-failure replay addressed by #343 and the field-redaction work in #363.

### Reproduction

1. Write the first half of one valid user-message JSONL record, without a newline.
2. Run `ingestCoworkSessions()`: it ingests zero rows but advances the line watermark.
3. Append the remainder of the record and its newline.
4. Run ingestion again: it still ingests zero rows, although one complete event is now available.

The same failure occurs when a partial final record follows already completed records: the saved watermark advances from 1 to 2 prematurely.

### Expected behavior

Leave an invalid, unterminated final record pending for a later tick. Preserve immediate ingestion of complete JSON at EOF without a newline, and continue skipping malformed records that already have a terminating newline so they do not block later events.

### Evidence

Two regression cases fail against unmodified source; two compatibility controls pass. The minimal fix passes all four, all 60 affected-suite tests, typecheck/build, and the full 5,853-test suite with coverage.

Validation: https://github.com/DivyamTalwar/hivemind/actions/runs/35658015441

## Pull request title

fix(cowork): retry incomplete transcript records without advancing progress

## Pull request body

### Summary

Prevent silent capture loss when the Cowork transcript writer appends one JSONL record across multiple writes. The ingester currently counts a parse failure at an unterminated EOF as processed; after the writer completes that line, the persisted watermark skips the event permanently.

- Keep an invalid, unterminated final record pending for the next ingestion tick.
- Preserve immediate ingestion of complete JSON at EOF without a newline.
- Continue skipping newline-terminated malformed records so later valid events are not blocked.
- Add four real-filesystem regression/compatibility tests.

No queue-format, identity, routing, redaction, or upload behavior changes. This is distinct from #343 and #363. Only the production source and tests are included; the audit workflow is not included.

### Version Bump

No release requested from this contributor PR. `package.json` is unchanged; maintainers can include the fix in their next planned release.

### Test plan

Validated against upstream `ce30de7ca94115cb73fa991538c6d2595ac2622a` on Ubuntu 24.04 / Node 22.23.2:

- Negative control: both split-write regressions fail on unmodified source, while the complete-EOF and malformed-terminated-line compatibility controls pass.
- `npx vitest run tests/claude-code/cowork-ingest.test.ts tests/claude-code/cowork-queue-leak.test.ts tests/claude-code/session-queue.test.ts`: 60 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npx vitest run --coverage`: 314 files / 5,853 tests passed, including coverage thresholds.
- `git diff --cached --check`: passed.

Validation and negative-control artifact: https://github.com/DivyamTalwar/hivemind/actions/runs/35658015441

Tested commit: `75b015c80a67bba0e22083bf2aebcf70c1470de2`.

The regression uses temporary transcript, queue, and state files and a mocked offline upload client. It does not validate the Claude Desktop UI or a live Deep Lake account.

---

# Submission 2

## Issue title

Inflight queue recovery can silently discard persisted rows after an unterminated queue tail

## Issue body

### Reproduced on

`main` at `ce30de7ca94115cb73fa991538c6d2595ac2622a` (`0.7.159`).

### Problem

`requeueInflight()` appends the inflight file to the current queue without checking its final byte. If an interrupted producer left an unterminated JSON record in the newer queue, the first recovered row is concatenated to that fragment. `readQueuedRows()` later skips the combined invalid line, silently losing a valid row that had already been persisted before the upload failed.

A complete JSON record without a newline also combines with the recovered record into invalid JSON, losing both. The normal append path already protects record boundaries; inflight recovery does not.

### Reproduction

1. Queue a valid row and begin a flush, which moves it into `.inflight`.
2. During the upload, leave an unterminated record in the newly created `.jsonl` queue.
3. Fail the upload so `requeueInflight()` restores its rows.
4. Retry successfully: the previously persisted valid row does not reach the upload query.

Stale-inflight recovery has the same boundary problem.

### Expected behavior

Ensure recovered rows begin at a record boundary without adding blank bytes on every failed retry or changing the queue size when it is already correctly terminated.

### Evidence

Three new regressions fail against unmodified source. Two controls (terminated and absent queues) pass. The corrected fix passes all five, 48 affected tests, and the full 5,854-test suite with coverage.

Validation: https://github.com/DivyamTalwar/hivemind/actions/runs/35659098663

## Pull request title

fix(queue): preserve record boundaries when recovering inflight rows

## Pull request body

### Summary

Preserve persisted session rows when a failed or stale inflight upload is recovered into a queue containing an unterminated tail.

- Inspect the final byte and append through the same open descriptor, reusing the existing `endsWithNewline` helper.
- Add a separator only when needed, so recovered valid rows are not glued to a damaged tail and then silently skipped by the reader.
- Keep ordinary and full-queue retries byte-stable; no unconditional blank-line growth.
- Add three regression cases and two compatibility controls using the real queue functions and temporary files.

This preserves append-based recovery and does not restore the rename behavior avoided by #61. It does not claim to solve every possible cross-process race or make the entire queue crash-transactional.

### Version Bump

No release requested from this contributor PR. `package.json` is unchanged.

### Test plan

Ubuntu 24.04 / Node 22.23.2; upstream base `ce30de7ca94115cb73fa991538c6d2595ac2622a`:

- Unmodified-source negative control: 3 regressions fail / 2 compatibility controls pass.
- `npx vitest run tests/claude-code/session-queue.test.ts tests/claude-code/session-queue-append-atomicity.test.ts tests/claude-code/cowork-queue-leak.test.ts`: 48 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run dup`: passed.
- `npm run audit:openclaw -- --criticals-only`: passed; 0 critical, 4 advisory warnings.
- `npx vitest run --coverage`: 314 files / 5,854 tests passed, coverage thresholds passed.
- `git diff --cached --check`: passed.

An initial unconditional-newline candidate was rejected by existing outage-growth and queue-ceiling tests. The committed change uses a conditional separator and passes those existing tests unchanged.

Validation and evidence: https://github.com/DivyamTalwar/hivemind/actions/runs/35659098663

Tested commit: `728aa7de466e51ba05174eb5ec7e92576456a48b`.

No live account credentials or network database are required by these regressions.
