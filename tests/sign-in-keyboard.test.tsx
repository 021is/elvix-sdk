// @vitest-environment jsdom
/**
 * The sign-in card and the phone's keyboard (0.26, Edvard 2026-11-11: "the elvix sdk for
 * sign in must be aware of the keyboard on mobile"): the keyboard's action key says what
 * Enter does, a focused field and its button stay in view, and a touch screen never gets the
 * keyboard thrown up by an autofocus. The identifier field's passkey autofill is
 * `sign-in-passkey-autofill.test.tsx`.
 */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixEmailCodeSignIn, ElvixProvider, ElvixSignInCard } from "../src/react/index";
import { canAutoFocus } from "../src/react/keyboard";
import { BASE, CLIENT_ID } from "./helpers/fake-elvix";
import {
  mount,
  PANE,
  readyField,
  resetBrowserStubs,
  stubPointer,
} from "./helpers/sign-in-keyboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetBrowserStubs();
});

/** The code step, reached by sending a code to an address. */
async function toCodeStep() {
  fireEvent.change(await screen.findByPlaceholderText("Enter your email", {}, PANE), {
    target: { value: "ada@example.test" },
  });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })));
  await screen.findByText(/We sent a code to/, {}, PANE);
}

describe("the keyboard's action key", () => {
  it("is 'go' on the identifier field, the step's one field", async () => {
    mount(<ElvixSignInCard navigate={false} methodEmailOtp />);
    const field = await readyField();
    expect(field.getAttribute("enterkeyhint")).toBe("go");
  });

  it("is 'next' on every code box but the last, which says 'go'", async () => {
    mount(<ElvixSignInCard navigate={false} methodEmailOtp />);
    await toCodeStep();
    const boxes = screen
      .getAllByRole("textbox")
      .filter((el) => el.getAttribute("autocomplete") === "one-time-code");
    expect(boxes.map((b) => b.getAttribute("enterkeyhint"))).toEqual([
      "next",
      "next",
      "next",
      "next",
      "next",
      "go",
    ]);
  });

  it("is 'go' on the username step and on the email-code block's email field", async () => {
    mount(<ElvixSignInCard navigate={false} mode="preview" previewStep="username" />);
    expect((await screen.findByLabelText("Username", {}, PANE)).getAttribute("enterkeyhint")).toBe(
      "go",
    );
    cleanup();
    mount(<ElvixEmailCodeSignIn mode="preview" previewStep="email" email="ada@example.test" />);
    const email = await screen.findByLabelText("Email", {}, PANE);
    expect(email.getAttribute("enterkeyhint")).toBe("go");
  });
});

describe("a focused field stays in view with its button", () => {
  it("scrolls the button, then the field, to the nearest edge, again as the keyboard opens", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const viewport = new EventTarget();
    vi.stubGlobal("visualViewport", viewport);
    const seen: string[] = [];
    const scroll = vi.fn(function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
      expect(arg).toEqual({ block: "nearest" });
      // An earlier test's frame may still land on its own, unmounted card: not this one's.
      if (this.isConnected) seen.push(this.tagName);
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scroll,
    });
    mount(<ElvixSignInCard navigate={false} methodEmailOtp />);
    const field = await readyField();
    // Nothing focuses the identifier on open (the keyboard would jump up on a phone).
    expect(document.activeElement).not.toBe(field);
    expect(seen).toEqual([]);
    act(() => field.focus());
    expect(seen).toEqual(["BUTTON", "INPUT"]);
    viewport.dispatchEvent(new Event("resize"));
    expect(seen).toEqual(["BUTTON", "INPUT", "BUTTON", "INPUT"]);
    act(() => field.blur());
    viewport.dispatchEvent(new Event("resize"));
    expect(seen).toHaveLength(4);
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });
});

describe("autofocus", () => {
  it("only with a fine pointer", () => {
    stubPointer("fine");
    expect(canAutoFocus()).toBe(true);
    stubPointer("coarse");
    expect(canAutoFocus()).toBe(false);
  });

  it.each([
    ["a mouse", "fine", true],
    ["a touch screen", "coarse", false],
  ] as const)("the username step with %s", async (_, pointer, focused) => {
    mount(<ElvixSignInCard navigate={false} mode="preview" previewStep="username" />, pointer);
    const field = await screen.findByLabelText("Username", {}, PANE);
    expect(document.activeElement === field).toBe(focused);
  });

  it.each([
    ["a mouse", "fine", true],
    ["a touch screen", "coarse", false],
  ] as const)("the code boxes with %s", async (_, pointer, focused) => {
    mount(<ElvixSignInCard navigate={false} methodEmailOtp />, pointer);
    await toCodeStep();
    expect(document.activeElement === screen.getByLabelText(/Digit 1/)).toBe(focused);
  });

  it("never reaches a server's HTML, where a phone would act on it at load", () => {
    const html = renderToString(
      <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
        <ElvixEmailCodeSignIn mode="preview" previewStep="email" email="ada@example.test" />
        <ElvixSignInCard navigate={false} mode="preview" previewStep="username" />
      </ElvixProvider>,
    );
    expect(html).toContain("Username");
    expect(html.toLowerCase()).not.toContain("autofocus");
  });
});
