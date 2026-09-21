"""Isolated audit controller; never included in the proposed fix branch."""
import pathlib
import sys

TEST = pathlib.Path('tests/claude-code/cowork-queue-leak.test.ts')
SOURCE = pathlib.Path('src/mcp/cowork-ingest.ts')

TESTS = r'''

describe("unterminated Cowork records", () => {
  it("retries a partial first record after the writer completes it", async () => {
    const path = transcriptPath();
    const complete = line("split across writes");
    const split = complete.indexOf("split across") + 5;
    writeFileSync(path, complete.slice(0, split));
    const { ingestCoworkSessions } = await import("../../src/mcp/cowork-ingest.js");
    expect(await ingestCoworkSessions()).toEqual({ ingested: 0 });
    expect(queuedRows()).toBe(0);
    appendFileSync(path, complete.slice(split));
    expect(await ingestCoworkSessions()).toEqual({ ingested: 1 });
    expect(queuedRows()).toBe(1);
    expect(await ingestCoworkSessions()).toEqual({ ingested: 0 });
    expect(queuedRows()).toBe(1);
  });

  it("keeps completed progress without consuming a partial final record", async () => {
    const path = transcriptPath();
    const second = line("second prompt");
    const split = second.indexOf("second prompt") + 6;
    writeFileSync(path, line("first prompt") + second.slice(0, split));
    const { ingestCoworkSessions } = await import("../../src/mcp/cowork-ingest.js");
    expect(await ingestCoworkSessions()).toEqual({ ingested: 1 });
    expect(await ingestCoworkSessions()).toEqual({ ingested: 0 });
    const statePath = join(home, ".deeplake", "cowork-ingest-state.json");
    expect(JSON.parse(readFileSync(statePath, "utf-8")).processedLines[path]).toBe(1);
    appendFileSync(path, second.slice(split) + line("third prompt"));
    expect(await ingestCoworkSessions()).toEqual({ ingested: 2 });
    expect(queuedRows()).toBe(3);
  });

  it("still ingests a complete JSON record without a final newline", async () => {
    const path = transcriptPath();
    writeFileSync(path, line("complete at EOF").trimEnd());
    const { ingestCoworkSessions } = await import("../../src/mcp/cowork-ingest.js");
    expect(await ingestCoworkSessions()).toEqual({ ingested: 1 });
    appendFileSync(path, "\n" + line("next record"));
    expect(await ingestCoworkSessions()).toEqual({ ingested: 1 });
    expect(queuedRows()).toBe(2);
  });

  it("skips newline-terminated malformed JSON instead of stalling later rows", async () => {
    const path = transcriptPath();
    writeFileSync(path, '{"broken":\n' + line("after malformed line"));
    const { ingestCoworkSessions } = await import("../../src/mcp/cowork-ingest.js");
    expect(await ingestCoworkSessions()).toEqual({ ingested: 1 });
    expect(queuedRows()).toBe(1);
    expect(await ingestCoworkSessions()).toEqual({ ingested: 0 });
  });
});
'''

if sys.argv[1] == 'test-only':
    text = TEST.read_text()
    assert 'unterminated Cowork records' not in text
    TEST.write_text(text + TESTS)
elif sys.argv[1] == 'fix':
    text = SOURCE.read_text()
    old = '''      let lines: string[];
      try {
        lines = readFileSync(path, "utf-8").split("\\n").filter(Boolean);'''
    new = '''      let lines: string[];
      let hasUnterminatedTail = false;
      try {
        const transcript = readFileSync(path, "utf-8");
        lines = transcript.split("\\n").filter(Boolean);
        hasUnterminatedTail = !transcript.endsWith("\\n");'''
    assert text.count(old) == 1
    text = text.replace(old, new)
    old = '''          parsed = JSON.parse(raw);
        } catch {
          processed += 1;
          continue;
        }'''
    new = '''          parsed = JSON.parse(raw);
        } catch {
          // The writer may still be appending this final JSONL record. Keep
          // its watermark so the completed record is retried on the next tick.
          // Malformed records terminated by a newline remain skippable.
          if (hasUnterminatedTail && processed === lines.length - 1) break;
          processed += 1;
          continue;
        }'''
    assert text.count(old) == 1
    SOURCE.write_text(text.replace(old, new))
else:
    raise SystemExit('expected test-only or fix')
