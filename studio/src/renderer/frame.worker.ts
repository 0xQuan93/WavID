import {getQuantumQuilGenerativeOrganismLoopSpec, prepareMaterialFrame} from "./material";
import type {QuantumQuilGenerativeOrganismProps} from "./material";

// The controller sends immutable props once per worker, preserving weak-map cache
// reuse without repeated structured clones or a growing cache of complete frames.
let props: QuantumQuilGenerativeOrganismProps | undefined;
self.onmessage = ({data}) => {
  try {
    if (data.props) props = data.props;
    if (!props || !Number.isFinite(data.frame)) throw new Error("Invalid waveform request.");
    const {durationInFrames} = getQuantumQuilGenerativeOrganismLoopSpec(props);
    const traces = prepareMaterialFrame(props, data.frame, durationInFrames);
    self.postMessage({id: data.id, traces});
  } catch (error) {
    self.postMessage({id: data.id, error: error instanceof Error ? error.message : "Waveform preparation failed."});
  }
};
