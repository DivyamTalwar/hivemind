import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../../src/notifications/sources/backend.js", () => ({
  fetchBackendNotifications: vi.fn(async () => []),
}));
vi.mock("../../src/notifications/sources/primary-banner.js", () => ({
  pickPrimaryBanner: vi.fn(async () => null),
}));
vi.mock("../../src/notifications/sources/low-balance.js", () => ({
  pickLowBalanceNotice: vi.fn(async () => null),
}));

import { drainSessionStart, enqueueNotification } from "../../src/notifications/index.js";
import { readQueue } from "../../src/notifications/queue.js";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

let tempHome = "";

afterEach(() => {
  clearFakeHome();
  rmSync(tempHome, { recursive: true, force: true });
  tempHome = "";
});

describe("notification queue drain ownership", () => {
  it("retains work enqueued while the current batch is delivered", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "hivemind-notification-drain-"));
    setFakeHome(tempHome);

    await enqueueNotification({
      id: "before-drain",
      title: "Before",
      body: "Existing work",
      dedupKey: { source: "test" },
    });

    const delivered: string[] = [];
    await drainSessionStart({
      agent: "claude-code",
      creds: null,
      deliver: (notifications) => {
        delivered.push(...notifications.map(n => n.id));
        void enqueueNotification({
          id: "during-drain",
          title: "During",
          body: "New work",
          dedupKey: { source: "test-during-drain" },
        });
      },
    });

    expect(delivered).toEqual(["before-drain"]);
    expect(readQueue().queue.map(n => n.id)).toEqual(["during-drain"]);
  });
});
