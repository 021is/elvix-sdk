// @vitest-environment jsdom
/** `<ElvixLanguages>`: add, change level, remove down to the empty tile. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixLanguages, ElvixProvider } from "../src/react/index";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount(languages: { id: string; code: string; level: string }[] = []) {
  const fake = installFakeElvix({ languages });
  const onResult = vi.fn();
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      <ElvixLanguages onResult={onResult} />
    </ElvixProvider>,
  );
  return { fake, onResult };
}

const button = (text: string) => screen.getByText(text).closest("button") as HTMLElement;

describe("ElvixLanguages", () => {
  it("adds a language from the empty tile", async () => {
    const { fake, onResult } = mount();
    fireEvent.click(await screen.findByText("Add a language"));
    fireEvent.click(await screen.findByText("German"));
    await screen.findByText(/How well do you speak German/);
    await act(async () => fireEvent.click(button("Continue")));

    await waitFor(() => expect(fake.state.languages).toHaveLength(1));
    expect(fake.patches).toEqual([{ code: "de", level: "INTERMEDIATE" }]);
    expect(onResult).toHaveBeenCalledWith({ ok: true, count: 1 });
    await screen.findByLabelText("Remove German");
  });

  it("changes the level of a listed language", async () => {
    const { fake } = mount([{ id: "l1", code: "de", level: "INTERMEDIATE" }]);
    fireEvent.click(await screen.findByText("German"));
    fireEvent.click(await screen.findByText("Elementary"));
    await act(async () => fireEvent.click(button("Save level")));

    await waitFor(() => expect(fake.state.languages[0]?.level).toBe("ELEMENTARY"));
    expect(fake.patches).toEqual([{ level: "ELEMENTARY" }]);
  });

  it("removes the last language and shows the empty tile", async () => {
    const { onResult } = mount([{ id: "l1", code: "de", level: "INTERMEDIATE" }]);
    fireEvent.click(await screen.findByLabelText("Remove German"));
    await act(async () => fireEvent.click(await screen.findByText("Remove")));

    await screen.findByText("Add a language");
    expect(onResult).toHaveBeenCalledWith({ ok: true, count: 0 });
  });
});
