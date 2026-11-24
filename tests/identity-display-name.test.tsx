// @vitest-environment jsdom
/**
 * `<ElvixIdentityForm>`'s Display name (0.27, Edvard): under the given and family name, before
 * the birthdate, "What others see. Your given and family name stay private.", prefilled with the
 * given name, saved per app. Shown only in an app (a bearer session with a membership): elvix's
 * own account has no app to save it on.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixIdentityForm, ElvixProvider } from "../src/react/index";
import { setElvixToken } from "../src/react/session";
import { BASE, CLIENT_ID, installFakeElvix, sampleContext } from "./helpers/fake-elvix";

function Provider({ children }: { children: ReactNode }) {
  return (
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      {children}
    </ElvixProvider>
  );
}

const givenName = () => screen.getByPlaceholderText("Jane") as HTMLInputElement;
const displayName = () => screen.getByLabelText("Display name") as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: /save/i }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  setElvixToken(null);
  vi.unstubAllGlobals();
});

async function renderInApp(membershipDisplayName?: string) {
  setElvixToken("tok_app");
  const context = sampleContext();
  if (membershipDisplayName !== undefined) {
    Object.assign(context.membership, { displayName: membershipDisplayName });
  }
  const fake = installFakeElvix({
    context,
    identity: { givenName: "Ada", familyName: "Lovelace" },
  });
  render(
    <Provider>
      <ElvixIdentityForm card={false} />
    </Provider>,
  );
  await waitFor(() => expect(givenName().value).toBe("Ada"));
  return fake;
}

describe("ElvixIdentityForm's Display name", () => {
  it("sits under the names, before the birthdate, prefilled with the given name, with its hint", async () => {
    await renderInApp();

    expect(displayName().value).toBe("Ada");
    const hint = screen.getByText("What others see. Your given and family name stay private.");
    expect(displayName().getAttribute("aria-describedby")).toBe(hint.id);
    const order = [givenName(), displayName(), screen.getByText(/^Birthdate/)];
    for (let i = 1; i < order.length; i++) {
      const before = order[i - 1] as Node;
      expect(
        before.compareDocumentPosition(order[i] as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(saveButton().disabled).toBe(true);
  });

  it("starts from the stored display name, and saves only what changed", async () => {
    const fake = await renderInApp("Ada L.");

    expect(displayName().value).toBe("Ada L.");
    fireEvent.change(displayName(), { target: { value: "  Countess " } });
    await act(async () => fireEvent.click(saveButton()));

    await waitFor(() => expect(fake.patches).toEqual([{ displayName: "Countess" }]));
  });

  it("clears it with null, so the app falls back to the given name", async () => {
    const fake = await renderInApp("Ada L.");

    fireEvent.change(displayName(), { target: { value: "" } });
    await act(async () => fireEvent.click(saveButton()));

    await waitFor(() => expect(fake.patches).toEqual([{ displayName: null }]));
  });

  it("is not there on elvix's own account (no bearer, so no app to save it on)", async () => {
    installFakeElvix({ identity: { givenName: "Ada" } });
    render(
      <Provider>
        <ElvixIdentityForm card={false} />
      </Provider>,
    );
    await waitFor(() => expect(givenName().value).toBe("Ada"));

    expect(screen.queryByLabelText("Display name")).toBeNull();
  });
});
