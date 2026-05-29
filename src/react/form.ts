import type { ZodIssue, ZodTypeAny, output } from "zod";

export type FieldErrors = Record<string, string>;

/** Reduce a list of Zod issues to a flat { field → first error } map. */
export function issuesToFieldErrors(issues: ZodIssue[]): FieldErrors {
  const f: FieldErrors = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? "");
    if (!key) continue;
    if (!f[key]) f[key] = i.message;
  }
  return f;
}

export type ParseResult<T> =
  | { ok: true; data: T; errors: FieldErrors }
  | { ok: false; data: null; errors: FieldErrors };

/** Wrapper that returns flat field errors instead of a ZodError tree. */
export function safeParseForm<S extends ZodTypeAny>(
  schema: S,
  input: unknown,
): ParseResult<output<S>> {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data, errors: {} };
  return { ok: false, data: null, errors: issuesToFieldErrors(r.error.issues) };
}
