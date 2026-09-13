import type {PreparedWavIdFrame} from "./usePreparedWavIdFrame";
import type {QuantumQuilGenerativeOrganismProps} from "./material";

export function createFrameController(options: {
  createWorker: () => Worker;
  props: QuantumQuilGenerativeOrganismProps;
  onFrame: (frame: PreparedWavIdFrame) => void;
  onError: (error: Error) => void;
}): {request(frame: number): void; dispose(): void};
