/**
 * Internal helpers shared by every `<Elvix*>` mutation component.
 * Not exported from the public package.
 */

import { authInit } from "./session";
import type { ElvixActionResult } from "../types/index";

export type FetchOpts = {
  baseUrl: string;
  applicationId: string;
};

/**
 * Standard POST against /api/account/apps/<appId>/<path>. Returns the
 * Spine ResponseDto envelope decoded into an `ElvixActionResult`.
 * Always sends `credentials: include` so the host's elvix cookie is
 * carried.
 */
export async function appPost<T>(
  opts: FetchOpts,
  path: string,
  body: unknown,
): Promise<ElvixActionResult<T>> {
  try {
    const auth = authInit();
    const res = await fetch(`${opts.baseUrl}/api/account/apps/${opts.applicationId}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth.headers },
      credentials: auth.credentials,
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: T;
      errorMessage?: string;
    };
    if (!res.ok || !json.success) {
      return { ok: false, error: json.errorMessage ?? "request_failed" };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return { ok: false, error: "network", message: e instanceof Error ? e.message : undefined };
  }
}

export async function appPatch<T>(
  opts: FetchOpts,
  path: string,
  body: unknown,
): Promise<ElvixActionResult<T>> {
  try {
    const auth = authInit();
    const res = await fetch(`${opts.baseUrl}/api/account/apps/${opts.applicationId}${path}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...auth.headers },
      credentials: auth.credentials,
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: T;
      errorMessage?: string;
    };
    if (!res.ok || !json.success) {
      return { ok: false, error: json.errorMessage ?? "request_failed" };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return { ok: false, error: "network", message: e instanceof Error ? e.message : undefined };
  }
}

export async function appDelete<T>(
  opts: FetchOpts,
  path: string,
): Promise<ElvixActionResult<T>> {
  try {
    const auth = authInit();
    const res = await fetch(`${opts.baseUrl}/api/account/apps/${opts.applicationId}${path}`, {
      method: "DELETE",
      headers: { ...auth.headers },
      credentials: auth.credentials,
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: T;
      errorMessage?: string;
    };
    if (!res.ok || (json.success !== undefined && !json.success)) {
      return { ok: false, error: json.errorMessage ?? "request_failed" };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return { ok: false, error: "network", message: e instanceof Error ? e.message : undefined };
  }
}
