/**
 * `elvix doctor` checklist logic. Mocks fetch to exercise the
 * green/red paths + the critical-vs-warning exit code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runDoctor } from "../src/cli/doctor";

const ORIG_FETCH = globalThis.fetch;
const ORIG_ARGV = process.argv;
let logged = "";

beforeEach(() => {
  logged = "";
  vi.spyOn(process.stdout, "write").mockImplementation((s) => {
    logged += String(s);
    return true;
  });
  process.argv = ["node", "elvix", "doctor"];
  delete process.env.ELVIX_API_KEY;
  delete process.env.ELVIX_CLIENT_ID;
  delete process.env.ELVIX_BASE_URL;
});

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
  process.argv = ORIG_ARGV;
  vi.restoreAllMocks();
});

function fetchMap(handler: (url: string, init?: RequestInit) => { ok: boolean; status: number }) {
  globalThis.fetch = vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input);
    const { ok, status } = handler(url, init);
    return Promise.resolve({ ok, status } as Response);
  }) as unknown as typeof fetch;
}

describe("runDoctor", () => {
  it("returns 0 when base URL + verify endpoint are healthy", async () => {
    fetchMap((url) => {
      if (url.endsWith("/llms.txt")) return { ok: true, status: 200 };
      if (url.includes("/api/v1/verify")) return { ok: false, status: 401 };
      return { ok: false, status: 404 };
    });
    const code = await runDoctor();
    expect(code).toBe(0);
    expect(logged).toContain("elvix is reachable");
  });

  it("returns 1 when the base URL is unreachable", async () => {
    fetchMap((url) => {
      if (url.includes("/api/v1/verify")) return { ok: false, status: 401 };
      return { ok: false, status: 0 };
    });
    const code = await runDoctor();
    expect(code).toBe(1);
    expect(logged).toContain("NOT reachable");
  });

  it("returns 1 when the verify endpoint is down (not 401)", async () => {
    fetchMap((url) => {
      if (url.endsWith("/llms.txt")) return { ok: true, status: 200 };
      if (url.includes("/api/v1/verify")) return { ok: false, status: 500 };
      return { ok: false, status: 404 };
    });
    const code = await runDoctor();
    expect(code).toBe(1);
  });

  it("flags a wrong clientId as a warning, not a hard fail", async () => {
    process.env.ELVIX_CLIENT_ID = "bogus";
    fetchMap((url) => {
      if (url.endsWith("/llms.txt")) return { ok: true, status: 200 };
      if (url.includes("/api/v1/verify")) return { ok: false, status: 401 };
      if (url.includes("/api/v1/bootstrap/")) return { ok: false, status: 404 };
      return { ok: false, status: 404 };
    });
    const code = await runDoctor();
    expect(code).toBe(0); // clientId is a warning
    expect(logged).toContain("wrong clientId");
  });

  it("notes ELVIX_API_KEY when present", async () => {
    process.env.ELVIX_API_KEY = "eak_abcdefgh_secret";
    fetchMap((url) => {
      if (url.endsWith("/llms.txt")) return { ok: true, status: 200 };
      if (url.includes("/api/v1/verify")) return { ok: false, status: 401 };
      return { ok: false, status: 404 };
    });
    await runDoctor();
    expect(logged).toContain("eak_abcd");
  });
});
