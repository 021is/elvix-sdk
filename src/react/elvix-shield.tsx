/**
 * Bare shield + accent-dot SVG. Shared by `<ElvixSignInButton>` and
 * `<ElvixSecuredBadge>` so the mark renders identically everywhere.
 *
 * `fill` colours the shield body; `accent` colours the active-protection dot.
 * Pure SVG, no styling deps — safe to drop into any host.
 */
export function ElvixShield({
  size,
  fill,
  accent,
}: {
  size: number;
  fill: string;
  accent: string;
}) {
  return (
    <svg width={size} height={size} viewBox="2 2 20 20" aria-hidden style={{ display: "block" }}>
      <path
        fill={fill}
        fillRule="evenodd"
        d="M 6 2.5 C 4.34 2.5 3 3.84 3 5.5 L 3 12.5 C 3 17.5 7 20.7 12 22 C 17 20.7 21 17.5 21 12.5 L 21 5.5 C 21 3.84 19.66 2.5 18 2.5 L 6 2.5 Z M 12 8.4 C 9.79 8.4 8 10.19 8 12.4 C 8 14.61 9.79 16.4 12 16.4 C 13.21 16.4 14.3 15.86 15.04 15 L 13.6 13.77 C 13.21 14.23 12.64 14.5 12 14.5 C 11.04 14.5 10.21 13.86 9.91 13 L 15.95 13 C 15.98 12.8 16 12.6 16 12.4 C 16 10.19 14.21 8.4 12 8.4 Z M 9.91 11.8 L 14.09 11.8 C 13.79 10.94 12.96 10.3 12 10.3 C 11.04 10.3 10.21 10.94 9.91 11.8 Z"
      />
      <circle cx="19.5" cy="4.5" r="2.4" fill={accent} />
    </svg>
  );
}
