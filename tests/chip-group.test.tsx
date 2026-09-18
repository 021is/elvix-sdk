// @vitest-environment jsdom
/**
 * `<ElvixChipGroup>` is a group of native radios in every variant, named by its
 * legend. The grid variant used to be plain buttons with no selection
 * semantics at all, and the others were buttons dressed as radios, without
 * arrow-key navigation.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElvixChipGroup } from "../src/react/elvix-chip-group";

afterEach(cleanup);

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
] as const;

describe("ElvixChipGroup", () => {
  it.each(["grid", "pills", "segmented"] as const)(
    "%s: native radios named by the legend, reporting the choice",
    (variant) => {
      const onChange = vi.fn();
      render(
        <ElvixChipGroup
          variant={variant}
          legend="Plan"
          options={OPTIONS}
          value="a"
          onChange={onChange}
        />,
      );

      expect(screen.getByRole("group", { name: "Plan" })).toBeTruthy();
      const alpha = screen.getByRole("radio", { name: "Alpha" }) as HTMLInputElement;
      const beta = screen.getByRole("radio", { name: "Beta" }) as HTMLInputElement;
      expect(alpha.type).toBe("radio");
      expect(alpha.checked).toBe(true);
      expect(beta.checked).toBe(false);

      fireEvent.click(beta);
      expect(onChange).toHaveBeenCalledWith("b");
    },
  );
});
