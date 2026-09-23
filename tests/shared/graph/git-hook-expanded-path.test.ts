import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gitHooksDir } from "../../../src/graph/git-hook-install.js";

let root: string | undefined;
afterEach(() => { vi.unstubAllEnvs(); if (root) rmSync(root, { recursive: true, force: true }); root = undefined; });

describe("Git hook path interpolation", () => {
  it("resolves a home-relative core.hooksPath exactly as Git does", () => {
    root = mkdtempSync(join(tmpdir(), "graph-hooks-home-"));
    const home = join(root, "home"); const repo = join(root, "repo");
    mkdirSync(home); mkdirSync(repo);
    vi.stubEnv("HOME", home); vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1"); vi.stubEnv("GIT_CONFIG_GLOBAL", "/dev/null");
    execFileSync("git", ["-C", repo, "init", "-q"]);
    execFileSync("git", ["-C", repo, "config", "core.hooksPath", "~/shared hooks"]);
    const expected = execFileSync("git", ["-C", repo, "config", "--path", "--get", "core.hooksPath"], { encoding: "utf8" }).trim();
    expect(expected).toBe(join(home, "shared hooks"));
    expect(gitHooksDir(repo)).toBe(expected);
  });
});
