/**
 * Elvix logo — moved VERBATIM from the elvix monorepo
 * (`components/elvix-logo.tsx`). Used by `<ElvixSignInForm>`'s
 * "Secured by elvix" chip. No host dependencies. Do not restyle.
 *
 * Heraldic shield mark + lowercase "elvix" wordmark.
 *
 * Visual reading: SHIELD says "secure" instantly (universal symbol, no
 * competitor in auth-as-a-service owns it). Inside the shield, a lowercase
 * "e" is carved as negative space (the brand letter, made of the shield's
 * own dark interior). A small accent dot in the upper-right signals
 * "active protection."
 *
 * Construction is original; not derived from any competitor's mark.
 * Adapts to light/dark via currentColor on the shield.
 */
type ElvixLogoProps = {
  size?: number;
  withText?: boolean;
  className?: string;
};

export function ElvixLogo({ size = 22, withText = false, className }: ElvixLogoProps) {
  const wordmarkSize = Math.round(size * 0.84);
  return (
    <div className={`inline-flex items-center gap-[7px] ${className ?? ""}`} aria-label="elvix">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ display: "block", overflow: "visible" }}
      >
        {/*
          Single path with fill-rule="evenodd":
          1) Outer shield (filled with currentColor).
          2) Inner lowercase "e" subpaths subtract from the shield, revealing
             the page background through the letter.
        */}
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="
            M 6 2.5
            C 4.34 2.5 3 3.84 3 5.5
            L 3 12.5
            C 3 17.5 7 20.7 12 22
            C 17 20.7 21 17.5 21 12.5
            L 21 5.5
            C 21 3.84 19.66 2.5 18 2.5
            L 6 2.5
            Z

            M 12 8.4
            C 9.79 8.4 8 10.19 8 12.4
            C 8 14.61 9.79 16.4 12 16.4
            C 13.21 16.4 14.3 15.86 15.04 15
            L 13.6 13.77
            C 13.21 14.23 12.64 14.5 12 14.5
            C 11.04 14.5 10.21 13.86 9.91 13
            L 15.95 13
            C 15.98 12.8 16 12.6 16 12.4
            C 16 10.19 14.21 8.4 12 8.4
            Z

            M 9.91 11.8
            L 14.09 11.8
            C 13.79 10.94 12.96 10.3 12 10.3
            C 11.04 10.3 10.21 10.94 9.91 11.8
            Z
          "
        />
        {/* Active-protection indicator — small purple dot on the shield's upper-right */}
        <circle cx="19.5" cy="4.5" r="2.4" fill="#8e7dff" />
      </svg>
      {withText && (
        <span
          style={{ fontSize: wordmarkSize, lineHeight: 1, letterSpacing: "-0.025em" }}
          className="font-semibold lowercase"
        >
          elvix
        </span>
      )}
    </div>
  );
}
