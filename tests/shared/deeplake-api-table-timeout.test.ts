import { afterEach, describe, expect, it, vi } from "vitest";
import { DeeplakeApi } from "../../src/deeplake-api.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  fetchMock.mockReset();
  delete process.env.HIVEMIND_QUERY_TIMEOUT_MS;
});

describe("DeeplakeApi table discovery timeout", () => {
  it("returns a non-cacheable fallback when metadata fetch stalls", async () => {
    process.env.HIVEMIND_QUERY_TIMEOUT_MS = "20";
    fetchMock.mockImplementation((_url: string, opts: { signal?: AbortSignal }) =>
      new Promise<never>((_resolve, reject) => {
        opts.signal?.addEventListener("abort", () => {
          const error = new Error("request timed out");
          error.name = "TimeoutError";
          reject(error);
        }, { once: true });
      }));

    const api = new DeeplakeApi("tok", "https://api.test", "org", "ws", "memory");
    const result = await Promise.race([
      api.knownTablesOrNull(),
      new Promise<"test timeout">(resolve => setTimeout(() => resolve("test timeout"), 100)),
    ]);

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
