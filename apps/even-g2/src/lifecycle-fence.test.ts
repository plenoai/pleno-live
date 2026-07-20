import { describe, expect, it } from "vitest";

import { LifecycleFence } from "./lifecycle-fence";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("LifecycleFence", () => {
  it.each(["start", "pause"])(
    "invalidates a pending %s continuation after exit",
    async () => {
      const fence = new LifecycleFence();
      const operation = fence.capture();
      const pending = deferred();
      const continuation = pending.promise.then(() =>
        fence.isActive(operation),
      );

      fence.close();
      pending.resolve();

      await expect(continuation).resolves.toBe(false);
      expect(fence.isActive(fence.capture())).toBe(false);
    },
  );
});
