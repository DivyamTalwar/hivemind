# Additional validated Hivemind submissions

22 September 2026. These two previously prepared branches were recovered and revalidated independently, then combined with the two capture fixes. No upstream issue or PR was created: the connected integration rejected upstream publishing with HTTP 403. These are submission drafts, not published PRs.

Validation: https://github.com/DivyamTalwar/hivemind/actions/runs/35660567156

All three jobs passed: private-store fix alone, daemon-error fix alone, and all four independent fixes combined. The combined run reports **5,862 passed, 0 failed, 0 pending**. Typecheck, build, duplication guard, and coverage thresholds passed. The critical-only OpenClaw audit passed with **0 critical and 4 advisory warnings**; this does not mean a warning-free security audit.

## 3. Owner-only private document storage

Branch: `fix/private-doc-store-permissions`
Commit: `677e122f085a24c51056e3ae117679b9c2372624`

### Issue title

Unpublished private document stores inherit group/other-readable permissions under a normal umask

### Issue draft

On upstream `ce30de7ca94115cb73fa991538c6d2595ac2622a`, `writeMap()` in `src/docs/private-store.ts` creates its directory and staging file without explicit private permissions. With umask 022, new directories are 0755 and stored unpublished document contents are 0644. Where ancestor directory permissions permit traversal, another local user can read material intended for the private branch/scope store.

The deterministic `<store>.<pid>.tmp` path also gives staging files a predictable name. The proposed change uses owner-only storage and an exclusive, random staging directory, while retaining atomic replacement on the same filesystem.

Three real-filesystem tests fail against unmodified production source and pass on the prepared fix: fresh-file permissions, repair of legacy permissions on replacement/deletion, and staging cleanup when replacement fails. The standalone fix passes 5,852 full-suite tests with coverage in Ubuntu/Node 22.

Scope: POSIX local file permissions. This does not implement Windows ACLs, encrypt contents, or retroactively repair every untouched store file at startup.

### PR title

fix(docs): keep unpublished private store contents owner-only

### PR body

## Summary

Make private document storage owner-only rather than inheriting umask-based defaults.

- Create the store root with mode 0700 and restrict an existing root on a write, without modifying its parent.
- Stage content in a random private directory and create the replacement file exclusively with mode 0600.
- Preserve same-filesystem atomic replacement and remove staging contents on success or failure.
- Add POSIX filesystem tests for fresh stores, legacy replacement/deletion, parent preservation, read-back, and failed replacement cleanup.

This is local confidentiality hardening, not a claim of fixing every private-store concurrency or filesystem threat.

## Version Bump

No release requested from this contributor PR; `package.json` is unchanged.

## Test plan

Upstream base: `ce30de7ca94115cb73fa991538c6d2595ac2622a`.
Tested commit: `677e122f085a24c51056e3ae117679b9c2372624`.
Environment: Ubuntu 24.04.5, Node 22.23.2.

- `npx vitest run tests/shared/docs-private-permissions.test.ts` against unmodified source: **3 failures**, demonstrating the regressions.
- `npm run typecheck`, `npm run build`, and `npm run dup`: passed on the fix.
- `npm run audit:openclaw -- --criticals-only`: passed, with 4 advisory warnings.
- `npx vitest run --coverage`: **5,852 passed**, coverage thresholds passed.
- Combined with the three other independently based fixes: **5,862 passed**, no pending tests.
- Diff whitespace check passed.

Run and downloadable evidence: https://github.com/DivyamTalwar/hivemind/actions/runs/35660567156

Only `src/docs/private-store.ts` and `tests/shared/docs-private-permissions.test.ts` are in this branch. No audit workflow, release change, or dependency change is included. Windows ACL behavior was not validated.

---

## 4. Asynchronous standalone daemon spawn failures

Branch: `fix/standalone-embed-spawn-errors`
Commit: `53a38ccdf74e6ebf0b6240b4fc58272ffc2d410e`

### Issue title

Asynchronous embedding-daemon spawn errors escape the standalone client's try/catch

### Issue draft

`trySpawnDaemon()` in `src/embeddings/standalone-embed-client.ts` catches synchronous exceptions from `spawn()`, but does not attach a ChildProcess `error` listener. An operating-system launch failure delivered asynchronously, such as EAGAIN or EACCES, therefore escapes the surrounding try/catch and can terminate the host process instead of taking the documented bounded null/fallback path.

A regression calls the real `tryEmbedStandalone()` with the existing spawn-injection seam and a child EventEmitter that emits its error on a later turn. It fails on unmodified source and passes when the child has an error listener. It also checks the null result and ownership-aware pidfile cleanup.

This is separate from #183's synchronous spawn exception handling and the Windows `.cmd` update work in #349. The test does not deliberately exhaust the OS process limit or claim an end-to-end run inside a live host agent.

### PR title

fix(embeddings): handle asynchronous standalone daemon spawn errors

### PR body

## Summary

Prevent asynchronous child-process spawn errors from escaping into the standalone embedding client's host.

- Attach a one-shot `error` listener before unref'ing the spawned child.
- Leave failure fallback and pidfile cleanup in the existing bounded-wait/ownership protocol rather than adding a competing cleanup path in the callback.
- Update the fake child in the existing suite to implement EventEmitter behavior.
- Add a regression covering a deferred child error, null fallback, and placeholder cleanup.

No changes to daemon socket format, embedding output, process permissions, retries, or the live-owner protocol.

## Version Bump

No release requested from this contributor PR; `package.json` is unchanged.

## Test plan

Upstream base: `ce30de7ca94115cb73fa991538c6d2595ac2622a`.
Tested commit: `53a38ccdf74e6ebf0b6240b4fc58272ffc2d410e`.
Environment: Ubuntu 24.04.5, Node 22.23.2.

- `npx vitest run tests/shared/standalone-embed-spawn-error.test.ts` against unmodified source: **1 failure**, demonstrating the escaped asynchronous error.
- `npm run typecheck`, `npm run build`, and `npm run dup`: passed on the fix.
- `npm run audit:openclaw -- --criticals-only`: passed, with 4 advisory warnings.
- `npx vitest run --coverage`: **5,850 passed**, coverage thresholds passed.
- Combined with the three other independently based fixes: **5,862 passed**, no pending tests.
- Diff whitespace check passed.

Run and downloadable evidence: https://github.com/DivyamTalwar/hivemind/actions/runs/35660567156

The new regression uses the production client and an EventEmitter-backed injected child. It validates the asynchronous error channel, not an actual OS EAGAIN event or Windows host integration.

---

## Publication gate

Refresh upstream main and duplicate/ownership checks before publishing. Attach real new issue numbers only after issue creation succeeds. Neither this document nor the saved branches imply maintainer assignment, upstream publication, approval, or merge.
