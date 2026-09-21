import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writePrivateDoc, readPrivateDoc, deletePrivateDoc, type PrivateDoc } from "../../src/docs/private-store.js";

const doc: PrivateDoc = {
  doc_id: "wiki/private", path: "/docs/project/wiki/private.md",
  content: "Unpublished branch documentation", source_fp: '{"private.ts":"abc"}',
  tier: "slow", updated_at: "2026-09-22T00:00:00Z",
};

describe.skipIf(process.platform === "win32")("private doc store filesystem permissions", () => {
  let parent: string;
  let root: string;
  let oldUmask: number;
  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), "hivemind-private-permissions-"));
    root = join(parent, "store");
    vi.stubEnv("HIVEMIND_DOCS_PRIVATE_DIR", root);
    oldUmask = process.umask(0o022);
  });
  afterEach(() => {
    process.umask(oldUmask);
    vi.unstubAllEnvs();
    rmSync(parent, { recursive: true, force: true });
  });

  function storePath(): string {
    const stores = readdirSync(root).filter((name) => name.endsWith(".json"));
    expect(stores).toHaveLength(1);
    return join(root, stores[0]);
  }

  it("keeps unpublished contents owner-only even under umask 022", () => {
    chmodSync(parent, 0o755);
    writePrivateDoc("project", "b:private", doc);
    expect(statSync(root).mode & 0o777).toBe(0o700);
    expect(statSync(storePath()).mode & 0o777).toBe(0o600);
    expect(statSync(parent).mode & 0o777).toBe(0o755);
    expect(readPrivateDoc("project", "b:private", doc.doc_id)).toEqual(doc);
  });

  it("tightens a legacy store on replacement and retains permissions on deletion", () => {
    writePrivateDoc("project", "b:private", doc);
    const file = storePath();
    chmodSync(root, 0o755);
    chmodSync(file, 0o644);
    writePrivateDoc("project", "b:private", { ...doc, content: "Updated private text" });
    expect(statSync(root).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    deletePrivateDoc("project", "b:private", doc.doc_id);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readPrivateDoc("project", "b:private", doc.doc_id)).toBeNull();
  });

  it("removes staging contents when the atomic replacement fails", () => {
    writePrivateDoc("project", "b:private", doc);
    const file = storePath();
    rmSync(file);
    mkdirSync(file);
    const before = readdirSync(root);
    expect(() => writePrivateDoc("project", "b:private", doc)).toThrow();
    expect(readdirSync(root)).toEqual(before);
    expect(statSync(file).isDirectory()).toBe(true);
  });
});
