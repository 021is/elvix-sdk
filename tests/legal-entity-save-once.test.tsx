// @vitest-environment jsdom
/**
 * One save at a time (0.23 review). A second press of Save, or a host's
 * `controls.next()` arriving while the create is still in flight, used to
 * POST the entity twice: two companies where the person made one.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ElvixProvider } from "../src/react/index";
import { useLegalEntities } from "../src/react/use-legal-entities";
import { BASE, CLIENT_ID, installFakeElvix, json, type Route } from "./helpers/fake-elvix";

afterEach(() => vi.unstubAllGlobals());

it("creates the entity once when the save is asked twice", async () => {
  let posts = 0;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const create: Route = [
    "POST",
    (u) => u.includes("/api/account/profile/entities"),
    async () => {
      posts += 1;
      await held;
      return json({ success: true, data: { ok: true } });
    },
  ];
  installFakeElvix({ entities: [] }, [create]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
      {children}
    </ElvixProvider>
  );
  const { result } = renderHook(() => useLegalEntities({}), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  act(() => result.current.draftApi.prefill({ type: "individual", legalName: "Ada Lovelace" }));
  act(() => {
    result.current.commit();
    result.current.commit();
  });
  await waitFor(() => expect(posts).toBe(1));
  await act(async () => release());
  expect(posts).toBe(1);
});
