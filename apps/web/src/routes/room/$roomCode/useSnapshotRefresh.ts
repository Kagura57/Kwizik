import { useRef } from "react";

export function useSnapshotRefresh(refetch: () => Promise<unknown>) {
  const inFlightRef = useRef<Promise<unknown> | null>(null);
  const pendingRef = useRef(false);

  const runRefresh = () => {
    const current = inFlightRef.current;
    if (current) {
      pendingRef.current = true;
      return current;
    }

    const next = Promise.resolve(refetch()).finally(() => {
      inFlightRef.current = null;
      if (pendingRef.current) {
        pendingRef.current = false;
        void runRefresh();
      }
    });
    inFlightRef.current = next;
    return next;
  };

  return runRefresh;
}
