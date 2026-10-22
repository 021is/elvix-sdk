/**
 * Verify a DPoP proof the way elvix does (elvix `lib/dpop.ts`): the header,
 * a signature that holds under the public key it carries, then the claims.
 * Shared by tests/dpop.test.ts and tests/dpop-phase2.test.ts.
 */

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const json = (part: string) => JSON.parse(new TextDecoder().decode(fromB64url(part)));

export async function sha256b64url(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return btoa(String.fromCharCode(...digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function verifyProof(proof: string) {
  const [h, p, s] = proof.split(".");
  const header = json(h);
  const key = await crypto.subtle.importKey(
    "jwk",
    header.jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    fromB64url(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  return { header, payload: json(p), valid };
}

export const newPair = () =>
  crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
    "verify",
  ]) as Promise<CryptoKeyPair>;
