/** A CSS length prop: a number is px, a string is any CSS length (`"50%"`,
 *  `"1rem"`), and undefined falls back to `preset`. */
export function cssLength<P extends number | string | undefined>(
  value: number | string | undefined,
  preset: P,
): string | P {
  if (value === undefined) return preset;
  return typeof value === "number" ? `${value}px` : value;
}
