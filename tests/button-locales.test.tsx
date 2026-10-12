// @vitest-environment jsdom
/**
 * `<ElvixSignInButton>` speaks every locale elvix ships, and any text a host
 * supplies. 0.13 shipped the labels in all 15 catalogs but the CDN held none
 * of them, so every non-English button read English; the sync script and these
 * tests are what stops that happening again.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESET_LABEL } from "../src/react/elvix-sign-in-button";
import { ElvixProvider, ElvixSignInButton } from "../src/react/index";
import { stubColorScheme } from "./helpers/fake-elvix";

type Catalog = { namespaces: Record<string, Record<string, { other: string }>> };

const DIR = join(__dirname, "../src/locale/catalogs");
const catalogs = Object.fromEntries(
  readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [
      f.replace(/\.json$/, ""),
      JSON.parse(readFileSync(join(DIR, f), "utf8")) as Catalog,
    ]),
);
const text = (tag: string, key: string) => {
  const [ns, name] = key.split(/\.(.+)/);
  return catalogs[tag]?.namespaces[ns as string]?.[name as string]?.other as string;
};

/** The CDN: serves the SDK's own catalogs, minus any namespaces in `without`. */
function serveCdn(without: string[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const tag = /\/([A-Za-z-]+)\.json/.exec(String(input))?.[1] ?? "";
      const catalog = catalogs[tag];
      if (!catalog) return new Response("{}", { status: 404 });
      const namespaces = Object.fromEntries(
        Object.entries(catalog.namespaces).filter(([ns]) => !without.includes(ns)),
      );
      return Response.json({ ...catalog, namespaces });
    }),
  );
}

beforeEach(() => {
  serveCdn();
  stubColorScheme("light");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (locale: string, button: React.ReactNode, messages?: Record<string, string>) =>
  render(
    <ElvixProvider
      locale={locale}
      i18nBase="https://cdn.test/elvix"
      messages={messages}
      presence={false}
    >
      {button}
    </ElvixProvider>,
  );

const LOCALES = Object.keys(catalogs).filter((tag) => tag !== "en");

describe("sign-in button, built-in locales", () => {
  it.each(LOCALES)("%s: every preset reads in that language", async (tag) => {
    for (const [preset, key] of Object.entries(PRESET_LABEL)) {
      const { unmount } = mount(
        tag,
        <ElvixSignInButton preset={preset as keyof typeof PRESET_LABEL} href="/in" />,
      );
      await waitFor(() => expect(screen.getByRole("link").textContent).toBe(text(tag, key)));
      unmount();
    }
  });

  it("English needs no network", () => {
    mount("en", <ElvixSignInButton preset="sign-in" href="/in" />);
    expect(screen.getByRole("link").textContent).toBe(text("en", "buttons.signIn"));
  });

  it("an older CDN with no `buttons` namespace shows English, never a raw key", async () => {
    serveCdn(["buttons"]);
    mount("de", <ElvixSignInButton preset="log-in" href="/in" />);
    await waitFor(() =>
      expect(screen.getByRole("link").textContent).toBe(text("en", "buttons.logIn")),
    );
  });
});

describe("sign-in button, host-supplied text", () => {
  it("a label prop wins over every locale", async () => {
    mount("de", <ElvixSignInButton label="Join the club" href="/in" />);
    await waitFor(() => expect(screen.getByRole("link").textContent).toBe("Join the club"));
  });

  it("messages reword one key and leave the rest in the locale", async () => {
    mount(
      "de",
      <>
        <ElvixSignInButton preset="sign-in" href="/a" />
        <ElvixSignInButton preset="log-in" href="/b" />
      </>,
      { "buttons.signIn": "Rein da" },
    );
    await waitFor(() => expect(screen.getAllByRole("link")[0]?.textContent).toBe("Rein da"));
    expect(screen.getAllByRole("link")[1]?.textContent).toBe(text("de", "buttons.logIn"));
  });

  it("a language elvix does not ship: the host's text, English for the rest", async () => {
    mount(
      "ja",
      <>
        <ElvixSignInButton preset="sign-in" href="/a" />
        <ElvixSignInButton preset="log-in" href="/b" />
      </>,
      { "buttons.signIn": "サインイン" },
    );
    await waitFor(() => expect(screen.getAllByRole("link")[0]?.textContent).toBe("サインイン"));
    expect(screen.getAllByRole("link")[1]?.textContent).toBe(text("en", "buttons.logIn"));
  });

  it("an inline messages object does not refetch the catalog on every render", async () => {
    const { rerender } = mount("de", <ElvixSignInButton preset="sign-in" href="/a" />, {
      "buttons.signIn": "Rein da",
    });
    await waitFor(() => expect(screen.getByRole("link").textContent).toBe("Rein da"));
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const calls = fetchMock.mock.calls.length;
    rerender(
      <ElvixProvider
        locale="de"
        i18nBase="https://cdn.test/elvix"
        messages={{ "buttons.signIn": "Rein da" }}
        presence={false}
      >
        <ElvixSignInButton preset="sign-in" href="/a" />
      </ElvixProvider>,
    );
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
