/**
 * The sign-in card mounted for the card-style tests (0.26): every part shown (logo, three
 * methods, the "or" line, the field, the host's slot, legal, chip), the part finder, and
 * which part each token moves with the class that reads its variable there.
 */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ElvixProvider, ElvixSignInCard } from "../../src/react/index";
import type { CardStyleToken, ElvixCardStyle } from "../../src/types/card-style";
import { BASE, CLIENT_ID, installFakeElvix } from "./fake-elvix";

export const PANE = { timeout: 3000 };
const ALL_METHODS = {
  methodGoogle: true,
  methodGithub: true,
  methodPasskey: true,
  methodEmailOtp: true,
  logoUrl: "https://acme.test/logo.svg",
} as const;

export function Provider({
  children,
  cardStyle,
  theme,
}: {
  children: ReactNode;
  cardStyle?: ElvixCardStyle;
  theme?: "light" | "dark";
}) {
  return (
    <ElvixProvider
      clientId={CLIENT_ID}
      baseUrl={BASE}
      presence={false}
      bootstrapRefreshMs={0}
      cardStyle={cardStyle}
      theme={theme}
    >
      {children}
    </ElvixProvider>
  );
}

/** The card mounted with every part shown, and its root (where the variables live). */
export async function mountCard(
  props: { cardStyle?: ElvixCardStyle } = {},
  opts: { provider?: ElvixCardStyle; console?: unknown; theme?: "light" | "dark" } = {},
) {
  installFakeElvix({
    context: null,
    bootstrap: {
      applicationId: "app_1",
      clientId: CLIENT_ID,
      appName: "Acme",
      brandColor: "#112233",
      onBrandColor: "#ffffff",
      theme: "light",
      ...(opts.console === undefined ? {} : { cardStyle: opts.console }),
    },
  });
  const view = render(
    <Provider cardStyle={opts.provider} theme={opts.theme}>
      <ElvixSignInCard
        navigate={false}
        {...ALL_METHODS}
        {...props}
        belowMethods={<p>Nobody dances alone.</p>}
      />
    </Provider>,
  );
  await screen.findByText("Nobody dances alone.", {}, PANE);
  const part = (name: string) => {
    const el = view.container.querySelector<HTMLElement>(`[data-elvix-${name}]`);
    if (!el) throw new Error(`no [data-elvix-${name}]`);
    return el;
  };
  const root = part("card-body").parentElement;
  if (!root) throw new Error("no card root");
  const cssVar = (name: string) => root.style.getPropertyValue(name);
  return { ...view, part, root, cssVar };
}

/** Which part each token moves, and the class that reads its variable there. */
export const WHERE: Record<CardStyleToken, { part: string; cls: string; cssVar: string }> = {
  headingWeight: {
    part: "heading",
    cls: "[font-weight:var(--elvix-heading-weight)]",
    cssVar: "--elvix-heading-weight",
  },
  logoHeight: { part: "head", cls: "h-(--elvix-logo-h)", cssVar: "--elvix-logo-h" },
  paddingX: { part: "card-body", cls: "px-(--elvix-card-px)", cssVar: "--elvix-card-px" },
  paddingTop: { part: "card-body", cls: "pt-(--elvix-card-pt)", cssVar: "--elvix-card-pt" },
  gapLogoTitle: {
    part: "head",
    cls: "gap-(--elvix-gap-logo-title)",
    cssVar: "--elvix-gap-logo-title",
  },
  gapTitleMethods: {
    part: "head",
    cls: "mb-(--elvix-gap-title-methods)",
    cssVar: "--elvix-gap-title-methods",
  },
  gapMethods: { part: "methods", cls: "gap-(--elvix-gap-methods)", cssVar: "--elvix-gap-methods" },
  gapDivider: { part: "divider", cls: "my-(--elvix-gap-divider)", cssVar: "--elvix-gap-divider" },
  gapFieldButton: {
    part: "",
    cls: "mt-(--elvix-gap-field-button)",
    cssVar: "--elvix-gap-field-button",
  },
  gapButtonSlot: {
    part: "below-methods",
    cls: "mt-(--elvix-gap-button-slot)",
    cssVar: "--elvix-gap-button-slot",
  },
  gapLegal: { part: "legal", cls: "mt-(--elvix-gap-legal)", cssVar: "--elvix-gap-legal" },
  gapFooter: { part: "card-body", cls: "pb-(--elvix-gap-footer)", cssVar: "--elvix-gap-footer" },
};

export const unitOf = (token: CardStyleToken) => (token === "headingWeight" ? "" : "px");

/** The card before 0.26, read from its classes: what every default must keep (and did, in
 *  Chromium: 62 elements, the same boxes). */
export const BEFORE_026: Record<CardStyleToken, string> = {
  headingWeight: "600", // font-semibold
  logoHeight: "48px", // h-12 / min-h-12
  paddingX: "28px", // px-7
  paddingTop: "28px", // pt-7
  gapLogoTitle: "12px", // gap-3
  gapTitleMethods: "24px", // mb-6
  gapMethods: "8px", // gap-2
  gapDivider: "20px", // the form's gap-2 + the divider's my-3
  gapFieldButton: "20px", // gap-2 + Continue's mt-3
  gapButtonSlot: "20px", // mt-5
  gapLegal: "20px", // mt-5
  gapFooter: "24px", // pb-3 + the chip row's mt-3 (transparent)
};
