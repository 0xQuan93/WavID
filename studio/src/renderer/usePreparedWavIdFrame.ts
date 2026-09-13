import {useEffect, useRef, useState} from "react";
import {getQuantumQuilGenerativeOrganismLoopSpec} from "./material";
import type {MaterialFrameTraces, QuantumQuilGenerativeOrganismProps} from "./material";
import {createFrameController} from "./frame-controller.mjs";

export type PreparedWavIdFrame = {
  props: QuantumQuilGenerativeOrganismProps;
  frame: number;
  traces: MaterialFrameTraces;
};

/** Prepare exact geometry off-thread. No animation clock or synchronous fallback. */
export function usePreparedWavIdFrame(
  props: QuantumQuilGenerativeOrganismProps | null | undefined,
  requestedFrame: number,
  {enabled = true}: {enabled?: boolean} = {},
) {
  const [prepared, setPrepared] = useState<PreparedWavIdFrame | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const controller = useRef<ReturnType<typeof createFrameController> | null>(null);
  const duration = props ? getQuantumQuilGenerativeOrganismLoopSpec(props).durationInFrames : 1;
  const frame = ((requestedFrame % duration) + duration) % duration;

  useEffect(() => {
    const changed = () => {
      if (document.hidden) {
        controller.current?.dispose();
        controller.current = null;
      }
      setVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);

  useEffect(() => {
    setError(null);
    if (!props || !enabled || !visible) return;
    const current = createFrameController({
      createWorker: () => new Worker(new URL("./frame.worker.ts", import.meta.url), {type: "module"}),
      props,
      onFrame: setPrepared,
      onError: setError,
    });
    controller.current = current;
    return () => {
      current.dispose();
      if (controller.current === current) controller.current = null;
    };
  }, [props, enabled, visible]);

  useEffect(() => {
    controller.current?.request(frame);
  }, [props, frame, enabled, visible]);

  const current = prepared?.props === props ? prepared : null;
  return {prepared: current, busy: Boolean(props && enabled && visible && !error && current?.frame !== frame), error};
}
