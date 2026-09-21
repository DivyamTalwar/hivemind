"""Audit-only controller; publish only the tested production/test diff."""
from pathlib import Path
import sys

TEST = Path('tests/claude-code/session-queue.test.ts')
SOURCE = Path('src/hooks/session-queue.ts')
TESTS = r'''

describe("session queue recovery record boundaries", () => {
  it.each([
    ["partial record", false, false, 1],
    ["complete record without a newline", true, false, 2],
    ["newline-terminated record", true, true, 2],
  ] as const)("recovers a failed batch after a %s", async (_name, complete, terminated, rows) => {
    const queueDir = makeQueueDir();
    const sessionId = "session-recovery-boundary";
    const original = makeRow(sessionId, 1);
    const pending = makeRow(sessionId, 2);
    const { queuePath } = appendQueuedSessionRow(original, queueDir);
    const failure = new Error("transient gateway failure");
    const failingApi = makeApi(async () => {
      // A producer writes to the new queue while the old one is in flight.
      writeFileSync(queuePath, complete
        ? JSON.stringify(pending) + (terminated ? "\n" : "")
        : '{"interrupted":');
      throw failure;
    });
    const options = { sessionId, sessionsTable: "sessions", queueDir };
    await expect(flushSessionQueue(failingApi, options)).rejects.toThrow(failure);
    expect(existsSync(join(queueDir, `${sessionId}.inflight`))).toBe(false);

    const recoveredApi = makeApi();
    expect(await flushSessionQueue(recoveredApi, options)).toEqual({
      status: "flushed", rows, batches: 1,
    });
    const sql = recoveredApi.query.mock.calls[0][0];
    expect(sql).toContain(original.id);
    if (complete) expect(sql).toContain(pending.id);
    expect(await flushSessionQueue(recoveredApi, options)).toEqual({
      status: "empty", rows: 0, batches: 0,
    });
    expect(recoveredApi.query).toHaveBeenCalledTimes(1);
  });

  it("preserves a stale inflight row after a partial queue tail", async () => {
    const queueDir = makeQueueDir();
    const sessionId = "session-stale-boundary";
    const original = makeRow(sessionId, 1);
    const { queuePath } = appendQueuedSessionRow(original, queueDir);
    const inflight = join(queueDir, `${sessionId}.inflight`);
    renameSync(queuePath, inflight);
    const staleTime = new Date(Date.now() - 60_000);
    utimesSync(inflight, staleTime, staleTime);
    writeFileSync(queuePath, '{"interrupted":');
    const api = makeApi();
    expect(await flushSessionQueue(api, {
      sessionId, sessionsTable: "sessions", queueDir,
      allowStaleInflight: true, staleInflightMs: 1_000,
    })).toEqual({ status: "flushed", rows: 1, batches: 1 });
    expect(api.query.mock.calls[0][0]).toContain(original.id);
    expect(existsSync(inflight)).toBe(false);
  });

  it("recovers into an absent queue without inventing an empty record", async () => {
    const queueDir = makeQueueDir();
    const sessionId = "session-absent-boundary";
    const original = makeRow(sessionId, 1);
    appendQueuedSessionRow(original, queueDir);
    const options = { sessionId, sessionsTable: "sessions", queueDir };
    await expect(flushSessionQueue(makeApi(async () => {
      throw new Error("transient gateway failure");
    }), options)).rejects.toThrow("transient gateway failure");
    const api = makeApi();
    expect(await flushSessionQueue(api, options)).toEqual({
      status: "flushed", rows: 1, batches: 1,
    });
    expect(api.query.mock.calls[0][0]).toContain(original.id);
  });
});
'''
if sys.argv[1] == 'test-only':
    text = TEST.read_text()
    assert 'session queue recovery record boundaries' not in text
    TEST.write_text(text + TESTS)
elif sys.argv[1] == 'fix':
    text = SOURCE.read_text()
    old = '  appendFileSync(queuePath, inflight);'
    new = '''  // An interrupted producer can leave an unterminated tail in the new
  // queue. Inspect and append through the same descriptor, as the normal
  // append path does, so recovered rows stay separate from that fragment.
  // Do not add a separator to empty or terminated files: repeated failures
  // must leave their byte size unchanged (including queues at the ceiling).
  const fd = openSync(queuePath, "a+");
  try {
    const separator = endsWithNewline(fd, fstatSync(fd).size) ? "" : "\\n";
    appendFileSync(fd, separator + inflight);
  } finally {
    closeSync(fd);
  }'''
    assert text.count(old) == 1
    SOURCE.write_text(text.replace(old, new))
else:
    raise SystemExit('expected test-only or fix')
