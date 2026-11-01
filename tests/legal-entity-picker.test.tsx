// @vitest-environment jsdom
/**
 * `<ElvixLegalEntityPicker>` (0.18): a tap picks, every pick is granted
 * before `onPick`, the default is pre-selected once, `types` filters, a
 * refused grant is shown and reported, and adding a company starts at its
 * VAT ID with the authority's name prefilled.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixLegalEntityPicker, ElvixProvider } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix, json, type Route } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const entity = (id: string, over: Record<string, unknown>) => ({
  id,
  type: "company",
  label: null,
  isDefault: false,
  legalName: id,
  tradingName: null,
  taxCountry: "DE",
  taxId: null,
  vatId: null,
  vatIdValidation: "none",
  vatIdValidatedAt: null,
  vatIdValidatedName: null,
  addressCity: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  ...over,
});

const grei = entity("le_grei", {
  legalName: "Grei Events GmbH",
  vatId: "DE129273398",
  vatIdValidation: "live",
  addressCity: "Berlin",
  isDefault: true,
});
const sole = entity("le_sole", {
  type: "sole_prop",
  legalName: "Ada Lovelace",
  taxId: "12345678901",
  addressCity: "Hamburg",
});
const person = entity("le_person", { type: "individual", legalName: "Ada Private" });

/** The grant route, answering `status`; every granted id lands in `granted`. */
function grantRoute(granted: string[], status = 200): Route {
  return [
    "POST",
    (u) => /\/api\/account\/apps\/[^/]+\/legal-entities\/[^/]+\/grant$/.test(u),
    (u) => {
      const id = decodeURIComponent(u.split("/legal-entities/")[1]?.split("/")[0] ?? "");
      if (status !== 200) return json({ success: false, errorMessage: "forbidden" }, status);
      granted.push(id);
      return json({ success: true, data: { grant: { entityId: id, grantedAt: "now" } } });
    },
  ];
}

function mount(props: Partial<Parameters<typeof ElvixLegalEntityPicker>[0]> = {}) {
  const onPick = vi.fn();
  const onResult = vi.fn();
  const view = render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <ElvixLegalEntityPicker
        types={["sole_prop", "company"]}
        onPick={onPick}
        onResult={onResult}
        {...props}
      />
    </ElvixProvider>,
  );
  return { onPick, onResult, view };
}

const row = (name: string) => screen.getByText(name).closest("button") as HTMLButtonElement;

describe("ElvixLegalEntityPicker", () => {
  it("pre-selects the default, granted before onPick", async () => {
    const granted: string[] = [];
    installFakeElvix({ entities: [grei, sole] }, [grantRoute(granted)]);
    const { onPick, onResult } = mount();

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(granted).toEqual(["le_grei"]);
    expect(onPick.mock.calls[0]?.[0]).toMatchObject({ id: "le_grei", vatId: "DE129273398" });
    expect(onResult).toHaveBeenCalledWith({ ok: true, entityId: "le_grei" });
  });

  it("shows what the invoice says, and Verified only for elvix's own check", async () => {
    installFakeElvix({ entities: [grei, sole] }, [grantRoute([])]);
    mount({ selectedId: "le_sole" });
    await screen.findByText("Grei Events GmbH");
    expect(screen.getByText("DE129273398 · Berlin")).toBeTruthy();
    expect(screen.getByText("12345678901 · Hamburg")).toBeTruthy();
    expect(screen.getAllByText("Verified")).toHaveLength(1);
    expect(row("Ada Lovelace").getAttribute("aria-pressed")).toBe("true");
  });

  it("offers only the host's types", async () => {
    installFakeElvix({ entities: [grei, person] }, [grantRoute([])]);
    mount({ selectedId: "le_grei" });
    await screen.findByText("Grei Events GmbH");
    expect(screen.queryByText("Ada Private")).toBeNull();
    expect(screen.getByText("Add a company")).toBeTruthy();
  });

  it("a tap grants and picks; a host's selectedId never auto-picks", async () => {
    const granted: string[] = [];
    installFakeElvix({ entities: [grei, sole] }, [grantRoute(granted)]);
    const { onPick } = mount({ selectedId: "le_grei" });
    await screen.findByText("Ada Lovelace");
    expect(granted).toEqual([]);
    await act(async () => fireEvent.click(row("Ada Lovelace")));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(granted).toEqual(["le_sole"]);
  });

  it("a refused grant is shown and reported, and onPick never fires", async () => {
    installFakeElvix({ entities: [grei] }, [grantRoute([], 403)]);
    const { onPick, onResult } = mount();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(onPick).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: "grant_failed" }),
    );
  });

  it("adds a company from its VAT ID, the authority's name prefilled", async () => {
    const validate: Route = [
      "GET",
      (u) => u.includes("/public/api/tax/validate"),
      () =>
        json({
          ok: true,
          result: {
            level: "live",
            name: "GOOGLE IRELAND LIMITED",
            authority: "VIES",
            normalisedId: "IE6388047V",
            address: "3RD FLOOR, GORDON HOUSE\nDUBLIN 4",
          },
        }),
    ];
    installFakeElvix({ entities: [] }, [grantRoute([]), validate]);
    mount({ types: ["company"] });

    fireEvent.click(await screen.findByText("Add a company"));
    // One type: no type choice, straight to the VAT ID.
    fireEvent.change(await screen.findByPlaceholderText("DE129273398"), {
      target: { value: "IE6388047V" },
    });
    expect(screen.getByText(/Ireland/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByText("Continue")));
    expect(
      await screen.findByDisplayValue("GOOGLE IRELAND LIMITED", {}, { timeout: 4000 }),
    ).toBeTruthy();
  });
});
