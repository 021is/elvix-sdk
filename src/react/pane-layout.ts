/**
 * How a sign-in pane stacks its children: `gap` on the container, never
 * `space-y-*`. `space-y` is a margin on the children, and one child with its
 * own margin (the OTP fieldset's `m-0`) silently cancels it: the code pane
 * had no gap between the boxes and the Verify button. A gap lives on the
 * container, so no child can remove it. `tests/pane-spacing.test.ts` fails
 * on a `space-y` in a pane.
 */
export const STACK_2 = "flex flex-col gap-2";
export const STACK_3 = "flex flex-col gap-3";
export const STACK_4 = "flex flex-col gap-4";
export const STACK_5 = "flex flex-col gap-5";
