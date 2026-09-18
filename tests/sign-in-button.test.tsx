// @vitest-environment jsdom
/** `<ElvixSignInButton>` redirect mode: where the link goes. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ElvixSignInButton } from "../src/react/index";

afterEach(cleanup);

const href = () => screen.getByRole("link").getAttribute("href");

describe("ElvixSignInButton redirect", () => {
  it("links to the client's hosted sign-in with an encoded return", () => {
    render(<ElvixSignInButton baseUrl="https://elvix.test" clientId="c1" returnUrl="/a?b=1" />);
    expect(href()).toBe("https://elvix.test/sign-in/c1?return=%2Fa%3Fb%3D1");
  });

  it("uses the generic sign-in without a client, and an explicit href as-is", () => {
    render(<ElvixSignInButton baseUrl="https://elvix.test" />);
    expect(href()).toBe("https://elvix.test/sign-in");
    cleanup();
    render(<ElvixSignInButton href="/custom" clientId="c1" />);
    expect(href()).toBe("/custom");
  });

  it("formats numeric lengths as px and keeps strings", () => {
    render(<ElvixSignInButton fontSize={15} borderRadius="50%" />);
    const style = screen.getByRole("link").style;
    expect(style.fontSize).toBe("15px");
    expect(style.borderRadius).toBe("50%");
  });
});
