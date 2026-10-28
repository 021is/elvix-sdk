/**
 * No file over 300 lines (CODING-RULES.md § Size). Files that were longer
 * when the rule became a check (2026-10-28) are debt, recorded with their
 * length in `.file-lines-baseline.json`: a recorded file may not grow, a
 * shorter one fails until its number is lowered to match (so the record is
 * always exact), and one back under 300 leaves the record. Nothing new is
 * ever recorded.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const LIMIT = 300;
/** What the rule covers: code, tests, scripts and the notes beside them. */
const DIRS = ["src", "tests", "scripts", "docs"];
const CODE = /\.(ts|tsx|mjs|md)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (CODE.test(name)) out.push(relative(ROOT, path));
  }
  return out;
}

function lineCount(file: string): number {
  const text = readFileSync(join(ROOT, file), "utf8");
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

const rootNotes = readdirSync(ROOT).filter((name) => name.endsWith(".md"));
const files = [...rootNotes, ...DIRS.flatMap((dir) => walk(join(ROOT, dir)))];
const baseline = JSON.parse(
  readFileSync(join(ROOT, ".file-lines-baseline.json"), "utf8"),
) as Record<string, number>;

describe("file length", () => {
  it("keeps every file at 300 lines or under, recorded debt aside", () => {
    const over = files
      .filter((f) => baseline[f] === undefined && lineCount(f) > LIMIT)
      .map((f) => `${f}: ${lineCount(f)} lines; split it by concern`);
    expect(over).toEqual([]);
  });

  it("lets recorded debt only shrink, and records it exactly", () => {
    const wrong = Object.entries(baseline).flatMap(([file, recorded]) => {
      if (!files.includes(file)) return [`${file}: gone; remove it from the baseline`];
      const now = lineCount(file);
      if (now > recorded) return [`${file}: ${now} lines, recorded ${recorded}; it may not grow`];
      if (now <= LIMIT) return [`${file}: ${now} lines; paid, remove it from the baseline`];
      if (now < recorded) return [`${file}: ${now} lines; lower its record from ${recorded}`];
      return [];
    });
    expect(wrong).toEqual([]);
  });
});
