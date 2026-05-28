/**
 * `elvix doctor` — diagnose an elvix integration from the terminal.
 *
 * Runs a green/red checklist so a developer (or their agent) can
 * answer "why isn't elvix working" in two seconds instead of a support
 * email. Read-only; never mutates anything.
 *
 * Checks:
 *   - base URL reachable (GET /llms.txt)
 *   - clientId resolves (GET /api/v1/bootstrap/<clientId> → 200)
 *   - verify endpoint live (POST /api/v1/verify with a dummy token → 401)
 *   - ELVIX_API_KEY present (informational)
 *
 * Inputs (env or flags):
 *   ELVIX_BASE_URL    default https://elvix.is        (--base-url=)
 *   ELVIX_CLIENT_ID   the app's public clientId       (--client-id=)
 *   ELVIX_API_KEY     server API key (presence only)
 */

const DEFAULT_BASE_URL = "https://elvix.is";

type Check = { label: string; ok: boolean; detail: string };

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

async function timed(fn: () => Promise<Response>, timeoutMs = 8000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fn();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function runDoctor(): Promise<number> {
  const baseUrl = flag("base-url") ?? process.env.ELVIX_BASE_URL ?? DEFAULT_BASE_URL;
  const clientId = flag("client-id") ?? process.env.ELVIX_CLIENT_ID;
  const apiKey = process.env.ELVIX_API_KEY;
  const checks: Check[] = [];

  // 1. Base URL reachable.
  const llms = await timed(() => fetch(`${baseUrl}/llms.txt`));
  checks.push({
    label: `Base URL reachable (${baseUrl})`,
    ok: Boolean(llms?.ok),
    detail: llms ? `HTTP ${llms.status}` : "no response / timeout",
  });

  // 2. clientId resolves via bootstrap.
  if (clientId) {
    const boot = await timed(() =>
      fetch(`${baseUrl}/api/v1/bootstrap/${encodeURIComponent(clientId)}`),
    );
    checks.push({
      label: `clientId resolves (${clientId})`,
      ok: Boolean(boot?.ok),
      detail: boot
        ? boot.ok
          ? `HTTP ${boot.status}`
          : `HTTP ${boot.status} — wrong clientId, or app is draft/deleted`
        : "no response / timeout",
    });
  } else {
    checks.push({
      label: "clientId resolves",
      ok: false,
      detail: "skipped — pass --client-id=<id> or set ELVIX_CLIENT_ID",
    });
  }

  // 3. Verify endpoint live (a dummy token must come back 401).
  const verify = await timed(() =>
    fetch(`${baseUrl}/api/v1/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "doctor-probe" }),
    }),
  );
  checks.push({
    label: "Verify endpoint live (POST /api/v1/verify)",
    ok: verify?.status === 401,
    detail: verify ? `HTTP ${verify.status} (401 expected)` : "no response / timeout",
  });

  // 4. API key presence (informational; we don't validate it here to
  //    avoid guessing a management endpoint).
  checks.push({
    label: "ELVIX_API_KEY present",
    ok: Boolean(apiKey),
    detail: apiKey ? `set (${apiKey.slice(0, 8)}…)` : "not set — server-side verify will fail",
  });

  // Render.
  let criticalFail = false;
  process.stdout.write("\nelvix doctor\n────────────\n");
  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    process.stdout.write(`  ${mark}  ${c.label}\n       ${c.detail}\n`);
  }
  // Criticals: base URL + verify endpoint. clientId + key are warnings.
  if (!checks[0]?.ok || !checks[2]?.ok) criticalFail = true;
  process.stdout.write(
    criticalFail
      ? "\nResult: elvix is NOT reachable from here. Check network / base URL.\n"
      : "\nResult: elvix is reachable. Warnings above (if any) are config hints.\n",
  );
  return criticalFail ? 1 : 0;
}
