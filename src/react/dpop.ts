"use client";

/**
 * DPoP (RFC 9449): proofs that a call comes from the browser that signed in.
 *
 * The browser keeps one P-256 key pair in IndexedDB, generated with
 * `extractable: false`, so no script (an XSS included) can read the private
 * key out; it can only ask the browser to sign while the page is open. Every
 * call that carries the session token also carries a proof: a small JWT
 * signed with that key, naming the method, the URL, the hash of the token and
 * elvix's latest nonce. An app with DPoP on (elvix Console, Sessions) binds
 * the session to this key at its first proved call, and from then on the
 * token alone is refused, so a token copied out of `localStorage` is useless.
 *
 * Anything missing (no IndexedDB, no WebCrypto, a private window that refuses
 * storage) means no proof, and the session simply stays unbound: never an
 * error the person sees.
 */

const DB_NAME = "elvix-dpop";
const STORE = "keys";
const KEY_ID = "session-key";
const NONCE_HEADER = "DPoP-Nonce";

let keyPair: Promise<CryptoKeyPair | null> | null = null;
let nonce: string | null = null;

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const b64urlJson = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function openStore(): Promise<IDBDatabase> {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  return request(open);
}

async function storedKey(store: IDBDatabase): Promise<CryptoKeyPair | null> {
  const read = store.transaction(STORE, "readonly").objectStore(STORE);
  const existing = (await request(read.get(KEY_ID))) as CryptoKeyPair | undefined;
  return existing?.privateKey && existing.publicKey ? existing : null;
}

/**
 * The stored key, or a new one stored with `add`, never `put`: two tabs that
 * open at the same moment both find nothing and both generate, and with `put`
 * the last write won while each tab kept signing with its own key. The session
 * bound to one of them, so the other tab was refused on every call, and after
 * a reload so was the first. With `add` the loser's write fails
 * (ConstraintError) and it takes the winner's key.
 */
async function loadOrCreateKey(): Promise<CryptoKeyPair | null> {
  if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) return null;
  try {
    const store = await openStore();
    const existing = await storedKey(store);
    if (existing) return existing;
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
      "sign",
    ])) as CryptoKeyPair;
    const write = store.transaction(STORE, "readwrite").objectStore(STORE);
    try {
      await request(write.add(pair, KEY_ID));
      return pair;
    } catch (error) {
      if ((error as DOMException | null)?.name !== "ConstraintError") throw error;
      return storedKey(store);
    }
  } catch {
    // Storage refused or unavailable: no proofs, the session stays unbound.
    return null;
  }
}

/** This browser's key, created once and kept; null where the browser cannot hold one. */
export function dpopKey(): Promise<CryptoKeyPair | null> {
  keyPair ??= loadOrCreateKey();
  return keyPair;
}

/** Tests only: use this pair (or none) instead of IndexedDB, and forget the nonce. */
export function __setDpopKeyForTests(pair: CryptoKeyPair | null): void {
  keyPair = Promise.resolve(pair);
  nonce = null;
}

/** The nonce elvix last handed out; a proof echoes it. */
export function rememberDpopNonce(res: Response): string | null {
  // Bookkeeping never fails a call, even on a response-like object without headers.
  const fresh = res.headers?.get(NONCE_HEADER) ?? null;
  if (fresh) nonce = fresh;
  return fresh;
}

export function currentDpopNonce(): string | null {
  return nonce;
}

/** RFC 9449 §4.2: the URL without query and fragment, absolute. */
function htu(url: string): string {
  const u = new URL(url, typeof window === "undefined" ? undefined : window.location.href);
  return `${u.origin}${u.pathname}`;
}

/** A proof for one call with `accessToken`; null when this browser holds no key. */
export async function dpopProof(
  method: string,
  url: string,
  accessToken: string,
): Promise<string | null> {
  const pair = await dpopKey();
  if (!pair) return null;
  try {
    const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const header = { typ: "dpop+jwt", alg: "ES256", jwk: { kty, crv, x, y } };
    const ath = b64url(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken)),
    );
    const payload = {
      jti: b64url(crypto.getRandomValues(new Uint8Array(16))),
      htm: method.toUpperCase(),
      htu: htu(url),
      iat: Math.floor(Date.now() / 1000),
      ath,
      ...(nonce ? { nonce } : {}),
    };
    const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
    // WebCrypto's ECDSA signature is already JOSE's raw r || s.
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      pair.privateKey,
      new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${b64url(signature)}`;
  } catch {
    return null;
  }
}
