// @vitest-environment jsdom
/**
 * `<ElvixAvatar>` / `<ElvixBanner>` upload flow (`use-image-editor.ts`).
 *
 * jsdom has no canvas and loads no images, so the crop-to-JPEG step and the
 * cropper are stand-ins: the cropper reports a crop area as soon as it mounts.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElvixAvatar, ElvixProvider } from "../src/react/index";
import { _clearUserMediaCache } from "../src/react/user-media";
import { BASE, CLIENT_ID, installFakeElvix } from "./helpers/fake-elvix";

vi.mock("../src/react/image-crop", () => ({
  cropToBlob: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
}));
vi.mock("react-easy-crop", () => ({
  default: function Cropper(props: {
    image: string;
    onCropComplete: (a: unknown, b: unknown) => void;
  }) {
    const { onCropComplete } = props;
    useEffect(() => {
      const area = { x: 0, y: 0, width: 10, height: 10 };
      onCropComplete(area, area);
    }, [onCropComplete]);
    return <div data-testid="cropper" data-image={props.image} />;
  },
}));

// jsdom has no object URLs; number them so a test can tell images apart.
const objectUrls = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
beforeEach(() => {
  _clearUserMediaCache();
  let n = 0;
  URL.createObjectURL = () => `blob:img-${++n}`;
  URL.revokeObjectURL = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.assign(URL, objectUrls);
});

describe("ElvixAvatar upload", () => {
  // The failed upload used to revoke and drop the picked image, leaving the
  // crop pane empty with a confirm button that did nothing.
  it("keeps the picked image after a failed upload, so a retry works", async () => {
    const fake = installFakeElvix();
    const route = fake.fetchMock.getMockImplementation();
    let failures = 1;
    fake.fetchMock.mockImplementation((input, init) =>
      init?.method === "PUT" && failures-- > 0
        ? Promise.resolve(new Response("{}", { status: 500 }))
        : (route?.(input, init) as Promise<Response>),
    );
    const onResult = vi.fn();
    const view = render(
      <ElvixProvider clientId={CLIENT_ID} baseUrl={BASE} presence={false} bootstrapRefreshMs={0}>
        <ElvixAvatar onResult={onResult} />
      </ElvixProvider>,
    );
    // Until the session lands the editor is in docs-preview mode (no network).
    await waitFor(() => expect(fake.calls("/media-meta")).toBeGreaterThan(0));
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["png"], "me.png", { type: "image/png" });
    act(() => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await act(async () => fireEvent.click(await screen.findByLabelText("Use this crop")));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ ok: false })),
    );
    expect((await screen.findByTestId("cropper")).dataset.image).toBe("blob:img-1");

    await act(async () => fireEvent.click(await screen.findByLabelText("Use this crop")));
    await waitFor(() =>
      expect(onResult).toHaveBeenLastCalledWith(
        expect.objectContaining({ ok: true, sizes: [128, 256] }),
      ),
    );
  });
});
