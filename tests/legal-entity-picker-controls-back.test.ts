// @vitest-environment jsdom
/**
 * `controls.back()` during the save (0.23 review). The saving pane has no
 * header, so there is no step to go back to; back() answered `false`, and a
 * host following `controls.back() || leavePane()` left the pane while the
 * entity was still being created. Inside the add flow it is always `true`.
 */
import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useElvixLegalEntityPickerControls } from "../src/react/index";

it("stays true inside the add flow when there is no step to go back to", () => {
  const { result } = renderHook(() => useElvixLegalEntityPickerControls());
  expect(result.current.back()).toBe(false);
  act(() => result.current.connection.setFlow({ adding: true, stepId: "saving", working: true }));
  expect(result.current.busy).toBe(true);
  expect(result.current.back()).toBe(true);
});
