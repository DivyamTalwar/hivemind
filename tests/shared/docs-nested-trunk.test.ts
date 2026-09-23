import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { currentScope, trunkBranch, type GitRunner } from "../../src/docs/branch-scope.js";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** Use real Git refs; no remote server or user configuration is required. */
function repository(branch: string): { git: GitRunner; run: (...args: string[]) => string } {
  const dir = mkdtempSync(join(tmpdir(), "nested-trunk-"));
  dirs.push(dir);
  const run = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  });
  run("init", "-q");
  run("symbolic-ref", "HEAD", `refs/heads/${branch}`);
  run("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-qm", "fixture");
  run("update-ref", `refs/remotes/origin/${branch}`, "HEAD");
  run("symbolic-ref", "refs/remotes/origin/HEAD", `refs/remotes/origin/${branch}`);
  return { run, git: (args) => { try { return run(...args); } catch { return null; } } };
}

describe("nested default branch identity", () => {
  it.each(["release/stable", "releases/2026/stable"])("preserves the complete %s trunk ref", (branch) => {
    const { git, run } = repository(branch);
    expect(trunkBranch(git)).toBe(branch);
    expect(currentScope(git)).toBe("main");
    run("checkout", "-qb", "feature/next");
    expect(currentScope(git)).toBe("b:feature/next");
  });
  it("does not confuse a leaf-name branch with the default branch", () => {
    const { git, run } = repository("release/stable");
    run("checkout", "-qb", "stable");
    expect(currentScope(git)).toBe("b:stable");
  });
  it("retains main as the fallback when origin/HEAD is absent", () => {
    expect(trunkBranch(() => null)).toBe("main");
  });
});
