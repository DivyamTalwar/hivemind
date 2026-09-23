import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { changedFilesFromGit } from "../../src/docs/candidates.js";

let dir: string | undefined;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined; });

/** Git's NUL-delimited path output must survive without trimming or unquoting. */
describe("literal changed-file names", () => {
  it("preserves tracked, committed and untracked names returned by real Git", () => {
    dir = mkdtempSync(join(tmpdir(), "doc-candidate-paths-"));
    const git = (...args: string[]) => execFileSync("git", ["-C", dir!, ...args], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
    });
    git("init", "-q");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "core.hooksPath", "/dev/null");
    git("config", "core.quotePath", "true");
    const tracked = ["résumé.ts", " tab\tfile.ts", "trailing.ts "];
    const committed = "multi\nline.ts";
    const untracked = " untouched.ts ";
    for (const name of tracked) writeFileSync(join(dir, name), "before\n");
    git("add", "--all"); git("commit", "-qm", "initial");
    writeFileSync(join(dir, committed), "committed\n");
    git("add", "--all"); git("commit", "-qm", "last commit");
    for (const name of tracked) writeFileSync(join(dir, name), "after\n");
    writeFileSync(join(dir, untracked), "new\n");
    expect(new Set(changedFilesFromGit(dir))).toEqual(new Set([...tracked, committed, untracked]));
  });
});
