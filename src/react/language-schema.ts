import { LANGUAGES, LANGUAGE_LEVELS } from "./languages";
import { z } from "zod";

/**
 * Spoken-language schemas for the elvix Profile SDK.
 *
 *   `languageSchema`        — STRICT. Add wizard enforces it before POST.
 *   `languagePatchSchema`   — LOOSE. Level-only PATCH on tap-to-edit.
 *
 * `code` is gated against the curated catalogue (`lib/sdk/languages`)
 * so a malformed POST can't smuggle in unknown codes.
 */

const LANG_CODES = new Set(LANGUAGES.map((l) => l.code));

export const languageSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .refine((c) => LANG_CODES.has(c), "Unknown language code"),
  level: z.enum(LANGUAGE_LEVELS),
});

export const languagePatchSchema = z.object({
  level: z.enum(LANGUAGE_LEVELS),
});

export type LanguageInput = z.infer<typeof languageSchema>;
export type LanguagePatchInput = z.infer<typeof languagePatchSchema>;

export type LanguageRecord = LanguageInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
