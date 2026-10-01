import { useCallback, useRef } from "react";

// Runs `fn(signal)` and aborts any earlier call still in flight, so fast typing
// or quick filter changes can never let a slow, stale response overwrite a
// newer one. Resolves to `undefined` (instead of throwing) when superseded.
export function useLatestRequest() {
  const controllerRef = useRef(null);
  return useCallback(async (fn) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const result = await fn(controller.signal);
      return controller.signal.aborted ? undefined : result;
    } catch (err) {
      if (controller.signal.aborted || err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return undefined;
      throw err;
    }
  }, []);
}
