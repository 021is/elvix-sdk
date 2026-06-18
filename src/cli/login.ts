/**
 * `elvix login` — OAuth 2.0 device flow from a terminal. Prints the
 * verification URL + user code, polls until the user approves in a browser,
 * then writes the access token (`eak_`) to stdout (status goes to stderr, so
 * `TOKEN=$(elvix login --client-id=… 2>/dev/tty)` captures just the token).
 */

import { pollDeviceToken, requestDeviceCode } from "../server/device.js";

function flag(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

export async function runLogin(): Promise<number> {
  const clientId = flag("client-id") ?? process.env.ELVIX_CLIENT_ID;
  if (!clientId) {
    process.stderr.write("elvix login: --client-id=<id> or ELVIX_CLIENT_ID is required.\n");
    return 1;
  }
  const baseUrl = flag("base-url") ?? process.env.ELVIX_BASE_URL;
  try {
    const code = await requestDeviceCode({ clientId, baseUrl });
    process.stderr.write(
      `\n  Open ${code.verificationUriComplete}\n  and confirm this code:  ${code.userCode}\n\n  Waiting for approval…\n`,
    );
    const result = await pollDeviceToken({
      clientId,
      deviceCode: code.deviceCode,
      baseUrl,
      interval: code.interval,
      expiresIn: code.expiresIn,
    });
    if (!result.ok) {
      process.stderr.write(`elvix login failed: ${result.error}\n`);
      return 1;
    }
    process.stderr.write("✓ logged in.\n");
    process.stdout.write(`${result.accessToken}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`elvix login error: ${(e as Error).message}\n`);
    return 1;
  }
}
