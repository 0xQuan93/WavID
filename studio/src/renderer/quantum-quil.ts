// Extracted from ArtistOS quantum-quil.tsx; see README.md for provenance.
import {random} from "./random";

export const QUANTUM_QUIL_FPS = 30;
export const QUANTUM_QUIL_DURATION = 240;

export type QuantumQuilForm =
  | "pulse-orb"
  | "echo-orb"
  | "relay-orb"
  | "veil-orb";

export type QuantumQuilOrganism = {
  attractorCount: number;
  asymmetry: number;
  filamentDensity: number;
  membraneTension: number;
  memory: number;
  nervousness: number;
  recovery: number;
  respirationBeats: number;
};

export type QuantumQuilSignal = {
  collapse: number;
  dropout: number;
  hold: number;
  interruption: number;
  retrace: number;
};

export type QuantumQuilProps = {
  accent: string;
  analogAmount: number;
  audio: string;
  background: string;
  bpm: number;
  edition: number;
  form: QuantumQuilForm;
  highlight: string;
  loopBeats: number;
  organism: QuantumQuilOrganism;
  signal: QuantumQuilSignal;
  secondary: string;
  seed: string;
  temperament: string;
  title: string;
  utility: string;
};

export type QuantumQuilLoopSpec = {
  beatCount: number;
  durationInFrames: number;
  durationInSeconds: number;
};

export const DEFAULT_QUANTUM_QUIL_PROPS: QuantumQuilProps = {
  accent: "#5cf5e5",
  analogAmount: 0.94,
  audio: "",
  background: "#000605",
  bpm: 128,
  edition: 1,
  form: "pulse-orb",
  highlight: "#d2fff5",
  loopBeats: 20,
  organism: {
    attractorCount: 1,
    asymmetry: 0.71,
    filamentDensity: 0.78,
    membraneTension: 0.44,
    memory: 0.81,
    nervousness: 0.38,
    recovery: 0.74,
    respirationBeats: 4,
  },
  signal: {
    collapse: 0.68,
    dropout: 0.72,
    hold: 0.61,
    interruption: 0.66,
    retrace: 0.76,
  },
  secondary: "#744057",
  seed: "quantum-quil:orb-test:0001",
  temperament: "listening",
  title: "Cobalt Listener",
  utility: "Silent art prototype",
};

const validLoopBeats = (bpm: number) => {
  const safeBpm = Math.min(240, Math.max(40, bpm));
  const minimum = Math.ceil(((5 * safeBpm) / 60) / 4) * 4;
  const maximum = Math.floor(((15 * safeBpm) / 60) / 4) * 4;
  return Array.from(
    {length: Math.max(1, Math.floor((maximum - minimum) / 4) + 1)},
    (_, index) => minimum + index * 4,
  );
};

export const getQuantumQuilLoopSpec = (
  props: Pick<QuantumQuilProps, "bpm" | "loopBeats" | "seed">,
): QuantumQuilLoopSpec => {
  const candidates = validLoopBeats(props.bpm);
  const requestedIsValid = candidates.includes(props.loopBeats);
  const seedIndex = Math.floor(random(`${props.seed}:loop-duration`) * candidates.length);
  const beatCount = requestedIsValid ? props.loopBeats : candidates[seedIndex];
  const durationInFrames = Math.max(
    1,
    Math.round(((beatCount * 60) / props.bpm) * QUANTUM_QUIL_FPS),
  );

  return {
    beatCount,
    durationInFrames,
    durationInSeconds: durationInFrames / QUANTUM_QUIL_FPS,
  };
};
