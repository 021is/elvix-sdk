// @vitest-environment jsdom
/**
 * `<ElvixLanguages>` reads in the SDK's locale: language names from the
 * platform (`Intl.DisplayNames`), level labels and hints from the catalog.
 * Before 0.14 both were hard-coded English whatever the locale.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ElvixLanguages,
  ElvixProvider,
  useElvixLanguageLevelLabel,
  useElvixLanguageNames,
} from "../src/react/index";
import { languageDisplayName } from "../src/react/languages";
import { BASE, CLIENT_ID, installFakeElvix, sampleContext } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const catalog = (tag: string) =>
  JSON.parse(readFileSync(join(__dirname, `../src/locale/catalogs/${tag}.json`), "utf8")) as {
    namespaces: Record<string, Record<string, { other: string }>>;
  };
const de = catalog("de").namespaces.languages as Record<string, { other: string }>;

/** elvix with `languages`, whose CDN serves the German catalog. */
function mount(ui: React.ReactNode, languages: { id: string; code: string; level: string }[]) {
  const fake = installFakeElvix({
    languages,
    context: sampleContext("usr_1", { languages }),
  });
  const base = fake.fetchMock.getMockImplementation();
  fake.fetchMock.mockImplementation(async (input, init) =>
    String(input).startsWith("https://cdn.test/elvix/")
      ? Response.json({ locale: "de", ...catalog("de") })
      : (base?.(input, init) as Promise<Response>),
  );
  render(
    <ElvixProvider
      clientId={CLIENT_ID}
      baseUrl={BASE}
      locale="de"
      i18nBase="https://cdn.test/elvix"
      presence={false}
      bootstrapRefreshMs={0}
    >
      {ui}
    </ElvixProvider>,
  );
}

describe("languageDisplayName", () => {
  it("names a language in the viewer's locale", () => {
    expect(languageDisplayName("de", "de")).toBe("Deutsch");
    expect(languageDisplayName("de", "fr")).toBe("allemand");
    expect(languageDisplayName("ja", "es")).toBe("japonés");
  });

  it("handles our lowercase variant codes", () => {
    expect(languageDisplayName("pt-br", "de")).toMatch(/Portugiesisch/);
    expect(languageDisplayName("zh-hans", "de")).toMatch(/Chinesisch/);
    expect(languageDisplayName("es-419", "de")).toMatch(/Spanisch/);
  });

  it("stays English in English, and falls back to English for a locale it cannot name in", () => {
    expect(languageDisplayName("de", "en")).toBe("German");
    expect(languageDisplayName("de", "not a locale")).toBe("German");
  });

  it("never throws on a code the platform has no name for", () => {
    expect(languageDisplayName("xx-unknown", "de")).toMatch(/xx/);
    expect(languageDisplayName("", "de")).toBe("");
  });
});

describe("<ElvixLanguages> in German", () => {
  it("lists names and levels in German", async () => {
    mount(<ElvixLanguages />, [{ id: "l1", code: "fr", level: "PROFICIENT" }]);
    await screen.findByText("Französisch");
    expect(screen.getByText(new RegExp(de.levelProficient?.other ?? "x"))).toBeTruthy();
    expect(screen.queryByText("French")).toBeNull();
    expect(screen.queryByText(/Proficient/)).toBeNull();
  });

  it("the level chooser shows German labels and hints", async () => {
    mount(<ElvixLanguages />, [{ id: "l1", code: "fr", level: "PROFICIENT" }]);
    fireEvent.click(await screen.findByText("Französisch"));
    await screen.findByText(de.levelElementary?.other ?? "x");
    for (const key of ["Elementary", "Intermediate", "Proficient", "Native"]) {
      const german = de[`level${key}`]?.other ?? "x";
      const hint = de[`level${key}Hint`]?.other ?? "x";
      expect(screen.getByText(german)).toBeTruthy();
      expect(screen.getByText(hint)).toBeTruthy();
    }
  });

  it("the picker searches by the German name and by the English one", async () => {
    mount(<ElvixLanguages />, []);
    fireEvent.click(await screen.findByText(de.addLanguage?.other ?? "x"));
    const search = await screen.findByPlaceholderText(de.searchPlaceholder?.other ?? "x");
    fireEvent.change(search, { target: { value: "japan" } });
    await waitFor(() => expect(screen.getByText("Japanisch")).toBeTruthy());
    fireEvent.change(search, { target: { value: "japanese" } });
    await waitFor(() => expect(screen.getByText("Japanisch")).toBeTruthy());
  });
});

describe("hosts show the editor's own words", () => {
  function Probe() {
    const label = useElvixLanguageLevelLabel("NATIVE");
    const names = useElvixLanguageNames();
    return (
      <p data-testid="probe">
        {label}|{names.map((n) => n.name).join(",")}
      </p>
    );
  }

  it("useElvixLanguageLevelLabel + useElvixLanguageNames follow the SDK locale", async () => {
    mount(<Probe />, [{ id: "l1", code: "pt-br", level: "NATIVE" }]);
    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toMatch(
        new RegExp(`^${de.levelNative?.other}\\|Portugiesisch`),
      ),
    );
  });
});
