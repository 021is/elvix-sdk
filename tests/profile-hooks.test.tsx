// @vitest-environment jsdom
/** `useElvixUser`, `useElvixPronounsLabel`, `useElvixLanguageNames`. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ElvixProvider,
  useElvixLanguageNames,
  useElvixPronounsLabel,
  useElvixUser,
} from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix, sampleContext } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Profile() {
  const { status, user } = useElvixUser();
  const pronouns = useElvixPronounsLabel(user?.pronouns);
  const languages = useElvixLanguageNames("en").map((l) => l.name);
  return (
    <p>
      {status}|{user?.displayName ?? "-"}|{pronouns ?? "-"}|{languages.join(",")}
    </p>
  );
}

function mount() {
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <Profile />
    </ElvixProvider>,
  );
}

describe("profile hooks", () => {
  it("reads the signed-in user with labels", async () => {
    installFakeElvix({
      context: sampleContext("usr_1", {
        pronouns: "she_her",
        languages: [
          { code: "de", level: "NATIVE" },
          { code: "fr", level: "INTERMEDIATE" },
        ],
      }),
    });
    mount();
    await screen.findByText("signed-in|Ada Lovelace|She / her|German,French");
  });

  it("falls back to the username when there is no name, and hides undisclosed pronouns", async () => {
    installFakeElvix({
      context: sampleContext("usr_1", { name: null, pronouns: "prefer_not_to_say" }),
    });
    mount();
    await screen.findByText("signed-in|ada|-|");
  });

  it("says signed-out, not loading, once the session probe settles", async () => {
    installFakeElvix({ context: null });
    mount();
    await screen.findByText("signed-out|-|-|");
    expect(screen.queryByText(/^loading/)).toBeNull();
  });
});
