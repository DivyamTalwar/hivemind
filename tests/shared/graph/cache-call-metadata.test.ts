import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileContentHash, readCache, writeCache } from "../../../src/graph/cache.js";
import { extractTypeScript } from "../../../src/graph/extract/typescript.js";
import { buildSnapshot } from "../../../src/graph/snapshot.js";

let dir: string | undefined;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined; });

/** Compare cached and uncached extraction through the actual resolver. */
describe("cache cross-file metadata after relocation", () => {
  it.each(["src/renamed.ts", "copied/consumer.ts"])("preserves resolved imported calls at %s", (destination) => {
    dir = mkdtempSync(join(tmpdir(), "cache-calls-"));
    const source = 'import { greet } from "./provider"; export function run() { return greet(); }';
    const original = extractTypeScript(source, "src/consumer.ts");
    const hash = fileContentHash(source);
    writeCache(dir, hash, original);
    const cached = readCache(dir, hash, destination)!;
    const fresh = extractTypeScript(source, destination);
    expect(cached.raw_calls).toEqual(fresh.raw_calls);
    expect(cached.import_bindings).toEqual(fresh.import_bindings);
    const providerPath = destination.replace(/[^/]+$/, "provider.ts");
    const provider = extractTypeScript('export function greet() { return "hi"; }', providerPath);
    const metadata = { schema_version: 1, generator: "hivemind-graph", commit_sha: "fixture", repo_key: "fixture" } as const;
    const observation = { ts: "2026-01-01T00:00:00Z", branch: "main", worktree_path: "/fixture", repo_project: "fixture", generator_version: "test", source_files_extracted: 2, source_files_skipped: 0 };
    const result = buildSnapshot([cached, provider], metadata, observation);
    expect(result.links).toEqual(buildSnapshot([fresh, provider], metadata, observation).links);
    expect(result.links.some((e) => e.source === `${destination}:run:function` && e.target === `${providerPath}:greet:function` && e.relation === "calls")).toBe(true);
    expect(readCache(dir, hash, "src/consumer.ts")!.raw_calls).toEqual(original.raw_calls);
  });
});
