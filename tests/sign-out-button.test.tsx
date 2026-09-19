// @vitest-environment jsdom
/** `<ElvixSignOutButton>`: its three presentations and its brand default. */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixProvider, ElvixSignOutButton } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ElvixSignOutButton", () => {
  it("renders as a menu item, a link, or a button", () => {
    const { rerender } = render(<ElvixSignOutButton as="menuitem" />);
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
    rerender(<ElvixSignOutButton as="link" preset="log-out" />);
    expect(screen.getByRole("button", { name: "Log out" }).className).toContain("underline");
    rerender(<ElvixSignOutButton type="icon" />);
    expect(screen.getByRole("button", { name: "Sign out" }).textContent).toBe("");
  });

  it("tone=brand filled defaults to the app's brand for the theme; a prop still wins", async () => {
    installFakeElvix(); // Console brand: #112233 light, #ddeeff dark
    const ui = (brandColor?: string) => (
      <ElvixProvider
        clientId={CLIENT_ID}
        baseUrl={BASE}
        theme="dark"
        presence={false}
        bootstrapRefreshMs={0}
      >
        <ElvixSignOutButton tone="brand" variant="filled" brandColor={brandColor} />
      </ElvixProvider>
    );
    const { rerender } = render(ui());
    await waitFor(() =>
      expect(screen.getByRole("button").style.backgroundColor).toBe("rgb(221, 238, 255)"),
    );
    rerender(ui("#ff0000"));
    expect(screen.getByRole("button").style.backgroundColor).toBe("rgb(255, 0, 0)");
  });
});
