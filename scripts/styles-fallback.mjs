/**
 * A browser without color-mix() never paints a tint in its full colour
 * (0.23.1). Used by scripts/postbuild.mjs on dist/styles.css.
 *
 * For every tint written with color-mix(), Tailwind's compiler emits two
 * rules: a fallback, then the same rule inside
 * `@supports (color:color-mix(in lab, red, red))`. For a colour that is a
 * CSS variable it cannot mix ahead of time, so the fallback is the bare
 * colour: a field, a list row, a hover or a picked tint painted at 100%,
 * near-black boxes and full-brand fills under dark text (Safari before 16.2,
 * Chrome before 111; seen in danceclub.team's served CSS, 2026-11-05).
 *
 * In each such fallback, only for the fills and borders its @supports twin
 * mixes, a bare variable becomes `transparent`; a chain keeps the host's own
 * variable in front, `var(--elvix-field, var(--elvix-fg-1))` ->
 * `var(--elvix-field, transparent)`. Modern browsers read the twin and see no
 * change. Hex fallbacks are already alpha-correct and are left alone.
 */

const PAIR =
  /([^{}]+)\{([^{}]*)\}(@supports \(color:color-mix\(in lab, ?red, ?red\)\)\{)([^{}]+)\{([^{}]*)\}\}/g;

/**
 * Fills and borders only. A focus ring or an underline at its full colour
 * is still right (a keyboard user sees the ring); a full-colour fill under
 * text is not.
 */
export const FILL_PROPS = /^(background-color|--tw-gradient-(from|via|to)|border(-[a-z]+)?-color)$/;

/** The fill props of a declaration list `a:b;c:d` whose value mixes. */
function mixedProps(body) {
  return new Set(
    body
      .split(";")
      .filter((d) => d.includes("color-mix("))
      .map((d) => d.slice(0, d.indexOf(":")).trim())
      .filter((prop) => FILL_PROPS.test(prop)),
  );
}

/** `var(--x)` -> `transparent`; `var(--x,var(--y))` -> `var(--x,transparent)`. */
function clearColour(value) {
  if (/^var\(--[\w-]+\)$/.test(value)) return "transparent";
  const chain = /^var\((--[\w-]+),\s*var\(.*\)\)$/.exec(value);
  return chain ? `var(${chain[1]},transparent)` : value;
}

/** The fallback's declarations with every mixed fill cleared; how many changed. */
function clearFallback(body, mixed) {
  let changed = 0;
  const fixed = body.split(";").map((d) => {
    const at = d.indexOf(":");
    if (at < 0 || !mixed.has(d.slice(0, at).trim())) return d;
    const value = d.slice(at + 1).trim();
    const cleared = clearColour(value);
    if (cleared !== value) changed += 1;
    return `${d.slice(0, at)}:${cleared}`;
  });
  return { body: fixed.join(";"), changed };
}

export function transparentFallbacks(css) {
  let changed = 0;
  const out = css.replace(PAIR, (...match) => {
    const [whole, sel, body, open, twinSel, twinBody] = match;
    if (sel.trim() !== twinSel.trim()) return whole;
    const fixed = clearFallback(body, mixedProps(twinBody));
    changed += fixed.changed;
    return `${sel}{${fixed.body}}${open}${twinSel}{${twinBody}}}`;
  });
  return { css: out, changed };
}
