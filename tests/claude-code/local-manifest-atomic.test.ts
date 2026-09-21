import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const writeFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  writeFileSyncMock.mockImplementation(actual.writeFileSync);
  return { ...actual, writeFileSync: writeFileSyncMock };
});

const { readLocalManifest, writeLocalManifest } = await import("../../src/skillify/local-manifest.js");

const tmpDir = mkdtempSync(join(tmpdir(), "local-manifest-atomic-test-"));
afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

function manifestPath(name: string): string {
  return join(tmpDir, `${name}.json`);
}

function manifest(count: number) {
  return {
    created_at: "2026-09-22T00:00:00.000Z",
    entries: Array.from({ length: count }, (_, i) => ({
      skill_name: `skill-${i}`,
      canonical_path: `/tmp/skill-${i}`,
      symlinks: [],
      source_session_ids: [`session-${i}`],
      source_session_paths: [`/tmp/session-${i}.jsonl`],
      source_agent: "claude_code",
      gate_agent: "claude_code",
      created_at: "2026-09-22T00:00:00.000Z",
      uploaded: false,
    })),
  };
}

describe("writeLocalManifest publication", () => {
  it("keeps the previous manifest when replacement fails after truncating the target", () => {
    const path = manifestPath("failure");
    const original = manifest(1);
    writeLocalManifest(original, path);

    const realWriteFileSync = writeFileSyncMock.getMockImplementation()!;
    writeFileSyncMock.mockImplementation((file: unknown, data: unknown, options: unknown) => {
      if (String(file).startsWith(path)) {
        realWriteFileSync(file as never, "{\"created_at\":");
        throw new Error("simulated disk-full during manifest publication");
      }
      return realWriteFileSync(file as never, data as never, options as never);
    });

    try {
      expect(() => writeLocalManifest(manifest(2), path)).toThrow(/disk-full/);
    } finally {
      writeFileSyncMock.mockImplementation(realWriteFileSync);
    }

    expect(readLocalManifest(path)).toEqual(original);
    expect(readdirSync(tmpDir).filter(name => name.startsWith("failure.json."))).toEqual([]);
  });
});
