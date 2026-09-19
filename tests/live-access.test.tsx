// @vitest-environment jsdom
/**
 * The live, read-only access layer: `useElvixRoles` and friends, and
 * `<ElvixLifecycleWatcher>`, over one shared presence stream.
 *
 * What these pin: many readers make one request and one connection; a
 * pushed change reaches the page without polling; an event about someone
 * else is ignored; an inline host callback does not reconnect anything.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetAccessStore } from "../src/react/access-store";
import {
  ElvixLifecycleWatcher,
  ElvixProvider,
  useElvixMemberships,
  useElvixRoles,
} from "../src/react/index";
import { _resetLiveStreams, parseSseFrames } from "../src/react/live-stream";
import { accessItem, BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

afterEach(() => {
  cleanup();
  _resetAccessStore();
  _resetLiveStreams();
  vi.unstubAllGlobals();
});

function Provider({ children }: { children: ReactNode }) {
  return (
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      {children}
    </ElvixProvider>
  );
}

function RoleNames({ label }: { label: string }) {
  const { roles, loading, has } = useElvixRoles();
  if (loading) return <p>{label}: loading</p>;
  return (
    <p>
      {label}: {roles.map((r) => r.name).join(", ") || "none"}
      {has("admin") ? " (admin)" : ""}
    </p>
  );
}

describe("parseSseFrames", () => {
  it("parses complete frames and keeps the unfinished tail", () => {
    const { events, rest } = parseSseFrames(
      ': keep-alive\n\nevent: a\ndata: {"x":1}\n\r\nevent: b\ndata: line1\ndata: line2\n\nevent: c\nda',
    );
    expect(events).toEqual([
      { type: "a", data: { x: 1 } },
      { type: "b", data: "line1\nline2" },
    ]);
    expect(rest).toBe("event: c\nda");
  });
});

describe("useElvixRoles", () => {
  it("shares one request and one stream between every reader", async () => {
    const fake = installFakeElvix({
      access: {
        roles: [accessItem("admin", "Admin"), accessItem("teacher", "Teacher")],
        scopes: [],
        memberships: [],
      },
    });
    render(
      <Provider>
        <RoleNames label="a" />
        <RoleNames label="b" />
        <RoleNames label="c" />
      </Provider>,
    );
    await screen.findByText("a: Admin, Teacher (admin)");
    await screen.findByText("c: Admin, Teacher (admin)");
    await waitFor(() => expect(fake.openStreams()).toBe(1));
    expect(fake.calls("/api/me/roles")).toBe(1);
  });

  it("updates when the stream says this user's roles changed, and only then", async () => {
    const fake = installFakeElvix({
      access: { roles: [accessItem("member", "Member")], scopes: [], memberships: [] },
    });
    render(
      <Provider>
        <RoleNames label="me" />
      </Provider>,
    );
    await screen.findByText("me: Member");
    await waitFor(() => expect(fake.openStreams()).toBe(1));
    const before = fake.calls("/api/me/roles");

    act(() => fake.push("user.roles.changed", { userId: "usr_other" }));
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(fake.calls("/api/me/roles")).toBe(before);

    fake.state.access.roles = [accessItem("member", "Member"), accessItem("admin", "Admin")];
    act(() => fake.push("user.roles.changed", { userId: "usr_1" }));
    await screen.findByText("me: Member, Admin (admin)");
  });

  it("is empty and settled when nobody is signed in, with no stream", async () => {
    const fake = installFakeElvix({ context: null });
    render(
      <Provider>
        <RoleNames label="guest" />
      </Provider>,
    );
    await screen.findByText("guest: none");
    expect(fake.openStreams()).toBe(0);
    expect(fake.calls("/api/me/roles")).toBe(0);
  });

  it("memberships share the same stream", async () => {
    const fake = installFakeElvix({
      access: { roles: [], scopes: [], memberships: [accessItem("gold", "Gold")] },
    });
    function Tiers() {
      const { memberships } = useElvixMemberships();
      return <p>tiers: {memberships.map((m) => m.name).join(", ")}</p>;
    }
    render(
      <Provider>
        <Tiers />
        <RoleNames label="r" />
      </Provider>,
    );
    await screen.findByText("tiers: Gold");
    await screen.findByText("r: none");
    await waitFor(() => expect(fake.openStreams()).toBe(1));
  });
});

describe("ElvixLifecycleWatcher", () => {
  it("signs the user out when the stream reports a ban, cross-origin", async () => {
    const fake = installFakeElvix();
    const onSignedOut = vi.fn();
    render(
      <Provider>
        <ElvixLifecycleWatcher onSignedOut={onSignedOut} />
      </Provider>,
    );
    await waitFor(() => expect(fake.openStreams()).toBe(1));
    act(() => fake.push("user.lifecycle.changed", { userId: "usr_1", status: "banned" }));
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledWith("banned"));
  });

  it("an inline onSignedOut that re-renders the host does not reconnect", async () => {
    const fake = installFakeElvix();
    function Host() {
      const [, setRenders] = useState(0);
      return (
        <Provider>
          <ElvixLifecycleWatcher onSignedOut={() => setRenders((n) => n + 1)} />
          <button type="button" onClick={() => setRenders((n) => n + 1)}>
            rerender
          </button>
        </Provider>
      );
    }
    render(<Host />);
    await waitFor(() => expect(fake.openStreams()).toBe(1));
    const streams = fake.calls("/api/presence/stream");
    const sessions = fake.calls("/api/v1/session");
    for (let i = 0; i < 3; i++) act(() => screen.getByText("rerender").click());
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(fake.calls("/api/presence/stream")).toBe(streams);
    expect(fake.calls("/api/v1/session")).toBe(sessions);
  });
});
