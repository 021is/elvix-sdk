// @vitest-environment jsdom
/**
 * The sign-in card and the phone's keyboard (0.26, Edvard 2026-11-11: "the elvix sdk for
 * sign in must be aware of the keyboard on mobile"): the keyboard's action key says what
 * Enter does, the identifier field offers the person's passkeys in its autofill without a
 * second prompt, a focused field and its button stay in view, and a touch screen never gets
 * the keyboard thrown up by an autofocus.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixEmailCodeSignIn, ElvixProvider, ElvixSignInCard } from "../src/react/index";
import { canAutoFocus } from "../src/react/keyboard";
import { BASE, CLIENT_ID, installFakeElvix, json } from "./helpers/fake-elvix";

const PANE = { timeout: 3000 };
const buf = (s: string) => new TextEncoder().encode(s).buffer;
const ASSERTION = {
  id: "cred1",
  rawId: buf("raw"),
  authenticatorAttachment: "platform",
  getClientExtensionResults: () => ({}),
  response: {
    clientDataJSON: buf("cd"),
    authenticatorData: buf("ad"),
    signature: buf("sig"),
    userHandle: null,
  },
};
const PASSKEY_ROUTES = [
  [
    "POST",
    (u: string) => u.includes("/api/auth/passkey/sign-in/start"),
    () => json({ success: true, data: { options: { challenge: "Y2g" } } }),
  ],
  [
    "POST",
    (u: string) => u.includes("/api/auth/passkey/sign-in/finish"),
    () => json({ success: true, data: { ok: true, redirect: "/home", token: "tok_pk" } }),
  ],
  [
    "POST",
    (u: string) => u.includes("/api/auth/otp/start"),
    () => json({ success: true, data: { ok: true, challengeId: "c1" } }),
  ],
] as const;

function stubPointer(pointer: "coarse" | "fine") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("coarse") && pointer === "coarse",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

type Get = (options: CredentialRequestOptions) => Promise<unknown>;

/** A browser with passkeys: `conditional` answers whether it offers them in a field. */
function stubPasskeys(get: Get, conditional = true) {
  Object.defineProperty(window, "PublicKeyCredential", {
    configurable: true,
    value: { isConditionalMediationAvailable: async () => conditional },
  });
  const spy = vi.fn(get);
  Object.defineProperty(navigator, "credentials", { configurable: true, value: { get: spy } });
  return spy;
}

/** A conditional request stays open until it is aborted, like a browser's autofill offer. */
const pendingUntilAborted: Get = (options) =>
  new Promise((_, reject) => {
    options.signal?.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError")),
    );
  });

/** The fake elvix stubs `matchMedia` for the colour scheme; the pointer is set after it. */
function mount(node: React.ReactNode, pointer: "coarse" | "fine" = "fine") {
  const fake = installFakeElvix({ context: null }, [...PASSKEY_ROUTES]);
  stubPointer(pointer);
  render(
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      {node}
    </ElvixProvider>,
  );
  return fake;
}

/** The identifier field once the envelope is in: the app's clientId, which a passkey sign-in
 *  names, comes with it (before it, the offer waits for the next focus). */
async function readyField() {
  await screen.findByText("Sign in to Acme", {}, PANE);
  return screen.getByPlaceholderText("Enter your email");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "matchMedia");
  Reflect.deleteProperty(window, "PublicKeyCredential");
  Reflect.deleteProperty(navigator, "credentials");
});

describe("the keyboard's action key", () => {
  it("is 'go' on the identifier field, the step's one field", async () => {
    mount(<ElvixSignInCard navigate={false} methodEmailOtp />);
    const field = await readyField();
    expect(field.getAttribute("enterkeyhint")).toBe("go");
  });

  it("is 'next' on every code box but the last, which says 'go'", async () => {
    mount(<ElvixSignInCard navigate={false} methodEmailOtp />);
    fireEvent.change(await screen.findByPlaceholderText("Enter your email", {}, PANE), {
      target: { value: "ada@example.test" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })));
    await screen.findByText(/We sent a code to/, {}, PANE);
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

describe("passkeys in the identifier field's autofill", () => {
  it("names the field for the browser's passkey autofill only when passkeys are on", async () => {
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />);
    const field = await readyField();
    expect(field.getAttribute("autocomplete")).toBe("email webauthn");
    cleanup();
    mount(<ElvixSignInCard navigate={false} methodUsername />);
    const plain = await screen.findByPlaceholderText(/username/i, {}, PANE);
    expect(plain.getAttribute("autocomplete")).toBe("username");
  });

  it("asks for nothing on open, then one conditional request when the field is focused", async () => {
    const get = stubPasskeys(pendingUntilAborted);
    const fake = mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />);
    const field = await readyField();
    expect(fake.calls("/api/auth/passkey/")).toBe(0);
    await act(async () => fireEvent.focus(field));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get.mock.calls[0]?.[0]).toMatchObject({ mediation: "conditional" });
    expect(get.mock.calls[0]?.[0]?.signal).toBeInstanceOf(AbortSignal);
    // A second focus while it is open does not ask again.
    await act(async () => fireEvent.focus(field));
    expect(get).toHaveBeenCalledTimes(1);
    expect(fake.calls("/api/auth/passkey/sign-in/start")).toBe(1);
  });

  it("the passkey button ends the autofill offer before its dialog: never two prompts", async () => {
    let open = 0;
    let most = 0;
    const get = stubPasskeys((options) => {
      open += 1;
      most = Math.max(most, open);
      if (options.mediation === "conditional") {
        return pendingUntilAborted(options).finally(() => {
          open -= 1;
        });
      }
      open -= 1;
      return Promise.resolve(ASSERTION);
    });
    const onResult = vi.fn();
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={onResult} />);
    const field = await readyField();
    await act(async () => fireEvent.focus(field));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    const conditionalSignal = get.mock.calls[0]?.[0]?.signal;
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Continue with passkey" })),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(conditionalSignal?.aborted).toBe(true);
    expect(get.mock.calls[1]?.[0]?.mediation).toBeUndefined();
    expect(most).toBe(1);
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, method: "passkey" }),
      ),
    );
  });

  it("a passkey picked from the autofill signs the person in", async () => {
    stubPasskeys(async () => ASSERTION);
    const onResult = vi.fn();
    mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey onResult={onResult} />);
    const field = await readyField();
    await act(async () => fireEvent.focus(field));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, method: "passkey" }),
      ),
    );
  });

  it("stays silent when the browser cannot offer it, and asks nothing", async () => {
    const get = stubPasskeys(pendingUntilAborted, false);
    const fake = mount(<ElvixSignInCard navigate={false} methodEmailOtp methodPasskey />);
    const field = await readyField();
    await act(async () => fireEvent.focus(field));
    await act(async () => {});
    expect(get).not.toHaveBeenCalled();
    expect(fake.calls("/api/auth/passkey/")).toBe(0);
    expect(screen.queryByRole("alert")).toBeNull();
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
    fireEvent.change(await screen.findByPlaceholderText("Enter your email", {}, PANE), {
      target: { value: "ada@example.test" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continue" })));
    await screen.findByText(/We sent a code to/, {}, PANE);
    const first = screen.getByLabelText(/Digit 1/);
    expect(document.activeElement === first).toBe(focused);
  });
});
