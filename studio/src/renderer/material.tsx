// ArtistOS material-v1 geometry with exact-result caching; browser adapter below.
// See README.md for source hashes and extraction details.
import React, {useMemo} from "react";
import {random} from "./random";
import {DEFAULT_QUANTUM_QUIL_PROPS, QUANTUM_QUIL_FPS, getQuantumQuilLoopSpec} from "./quantum-quil";
import type {QuantumQuilProps} from "./quantum-quil";

export type QuantumQuilMaterialPoint = {x: number; y: number};

export type QuantumQuilBodyFamily =
  | "ovoid"
  | "bilobed"
  | "trilobed"
  | "mantled"
  | "compressed"
  | "fronded";

export type QuantumQuilBodyHarmonic = {
  amplitude: number;
  order: 2 | 3 | 4 | 5;
  phase: number;
};

export type QuantumQuilBodyLobe = {
  amplitude: number;
  angle: number;
  concentration: number;
};

export type QuantumQuilMaterialCavity = {
  bridgePorosity: number;
  center: QuantumQuilMaterialPoint;
  irregularity: number;
  phase3: number;
  phase5: number;
  polarity?: -1 | 1;
  radii: QuantumQuilMaterialPoint;
  rotation: number;
  sourceStrength: number;
};

export type QuantumQuilAnatomyAnchor =
  | QuantumQuilMaterialPoint
  | {kind: "cavity" | "node"; index: number};

export type QuantumQuilMaterialBand = {
  bend?: number;
  control?: QuantumQuilMaterialPoint;
  from: QuantumQuilAnatomyAnchor;
  strength: number;
  to: QuantumQuilAnatomyAnchor;
  width: number;
};

export type QuantumQuilFlowNode = {
  center: QuantumQuilMaterialPoint;
  polarity: -1 | 1;
  radius: number;
  strength: number;
};

export type QuantumQuilMaterialAnatomy = {
  version: "material-v1";
  fingerprint: string;
  body: {
    aspect: number;
    family: QuantumQuilBodyFamily;
    harmonics: QuantumQuilBodyHarmonic[];
    lobes: QuantumQuilBodyLobe[];
    rotation: number;
    scale: number;
  };
  cavities: QuantumQuilMaterialCavity[];
  bands: QuantumQuilMaterialBand[];
  nodes: QuantumQuilFlowNode[];
};

export type QuantumQuilGenerativeOrganismProps = Omit<QuantumQuilProps, "audio"> & {
  anatomy: QuantumQuilMaterialAnatomy;
  audio?: "";
};

type SignalFault = {
  eventIndex: number;
  polarity: number;
  scanCenter: number;
  scanWidth: number;
  strength: number;
  xCenter: number;
  xWidth: number;
};

type FieldAccent = {
  band: number;
  node: number;
  total: number;
};

type FieldSample = FieldAccent & {
  activator: number;
  activity: number;
  excitation: number;
};

type MaterialField = {
  accent: (point: QuantumQuilMaterialPoint) => FieldAccent;
  map: (point: QuantumQuilMaterialPoint) => QuantumQuilMaterialPoint;
  sample: (point: QuantumQuilMaterialPoint) => FieldSample;
};

type MaterialTrace = {
  accentD: string;
  accentOpacity: number;
  accentWidth: number;
  activity: number;
  d: string;
  dash: string;
  opacity: number;
  width: number;
};

type FlowSource = {
  center: QuantumQuilMaterialPoint;
  polarity: -1 | 1;
  radius: number;
  strength: number;
};

type BandSegment = {
  a: QuantumQuilMaterialPoint;
  b: QuantumQuilMaterialPoint;
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
  strength: number;
  width: number;
};

const TAU = Math.PI * 2;
const BODY_RADIUS = 370;
const BODY_CENTER = {x: 540, y: 540};
const BOUNDARY_SAMPLES = 96;
const SILHOUETTE_SAMPLES = 192;
const BAND_SEGMENTS = 8;

const mod = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor;

const fract = (value: number) => value - Math.floor(value);

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
};

const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;

const circularDistance = (a: number, b: number) => {
  const distance = Math.abs(fract(a) - fract(b));
  return Math.min(distance, 1 - distance);
};

const add = (
  a: QuantumQuilMaterialPoint,
  b: QuantumQuilMaterialPoint,
): QuantumQuilMaterialPoint => ({x: a.x + b.x, y: a.y + b.y});

const scale = (
  point: QuantumQuilMaterialPoint,
  amount: number,
): QuantumQuilMaterialPoint => ({x: point.x * amount, y: point.y * amount});

const lengthOf = (point: QuantumQuilMaterialPoint) =>
  Math.hypot(point.x, point.y);

const normalize = (
  point: QuantumQuilMaterialPoint,
): QuantumQuilMaterialPoint => {
  const length = Math.max(0.0001, lengthOf(point));
  return {x: point.x / length, y: point.y / length};
};

const rotate = (
  point: QuantumQuilMaterialPoint,
  angle: number,
): QuantumQuilMaterialPoint => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
};

const limitVector = (
  point: QuantumQuilMaterialPoint,
  limit: number,
): QuantumQuilMaterialPoint => {
  const length = lengthOf(point);
  return length > limit ? scale(point, limit / length) : point;
};

const vonMisesPulse = (phase: number, concentration: number) =>
  Math.exp(concentration * (Math.cos(phase) - 1));

const getSignalFault = ({
  loopPhase,
  seed,
  signal,
}: Pick<QuantumQuilGenerativeOrganismProps, "seed" | "signal"> & {
  loopPhase: number;
}): SignalFault => {
  const eventCount = 5;
  let active: SignalFault = {
    eventIndex: -1,
    polarity: 1,
    scanCenter: 0,
    scanWidth: 0.12,
    strength: 0,
    xCenter: 0,
    xWidth: 0.2,
  };

  for (let index = 0; index < eventCount; index += 1) {
    const center = random(`${seed}:material-fault-center:${index}`);
    const width = 0.008 + random(`${seed}:material-fault-width:${index}`) * 0.018;
    const envelope = Math.max(0, 1 - circularDistance(loopPhase, center) / width);
    const strength =
      Math.pow(envelope, 0.38 + random(`${seed}:material-fault-edge:${index}`) * 0.46) *
      signal.interruption;

    if (strength > active.strength) {
      active = {
        eventIndex: index,
        polarity: random(`${seed}:material-fault-polarity:${index}`) > 0.5 ? 1 : -1,
        scanCenter: -0.54 + random(`${seed}:material-fault-scan:${index}`) * 1.08,
        scanWidth: 0.07 + random(`${seed}:material-fault-band:${index}`) * 0.17,
        strength,
        xCenter: -0.7 + random(`${seed}:material-fault-x:${index}`) * 1.4,
        xWidth: 0.075 + random(`${seed}:material-fault-xw:${index}`) * 0.22,
      };
    }
  }

  return active;
};

const quadraticPoint = (
  from: QuantumQuilMaterialPoint,
  control: QuantumQuilMaterialPoint,
  to: QuantumQuilMaterialPoint,
  amount: number,
): QuantumQuilMaterialPoint => {
  const inverse = 1 - amount;
  return {
    x:
      inverse * inverse * from.x +
      2 * inverse * amount * control.x +
      amount * amount * to.x,
    y:
      inverse * inverse * from.y +
      2 * inverse * amount * control.y +
      amount * amount * to.y,
  };
};

const distanceToSegment = (
  point: QuantumQuilMaterialPoint,
  a: QuantumQuilMaterialPoint,
  b: QuantumQuilMaterialPoint,
) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const amount =
    denominator <= 0.000001
      ? 0
      : clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator, 0, 1);
  return Math.hypot(point.x - (a.x + dx * amount), point.y - (a.y + dy * amount));
};

const resolveAnatomyAnchor = (
  anchor: QuantumQuilAnatomyAnchor,
  anatomy: QuantumQuilMaterialAnatomy,
): QuantumQuilMaterialPoint => {
  if ("x" in anchor) {
    return anchor;
  }
  const collection = anchor.kind === "cavity" ? anatomy.cavities : anatomy.nodes;
  return collection[anchor.index]?.center ?? {x: 0, y: 0};
};

const materializeBandSegments = (
  anatomy: QuantumQuilMaterialAnatomy,
): BandSegment[] =>
  anatomy.bands.slice(0, 8).flatMap((band) => {
    const from = resolveAnatomyAnchor(band.from, anatomy);
    const to = resolveAnatomyAnchor(band.to, anatomy);
    const direction = {x: to.x - from.x, y: to.y - from.y};
    const perpendicular = normalize({x: -direction.y, y: direction.x});
    const control =
      band.control ??
      add(
        scale(add(from, to), 0.5),
        scale(perpendicular, clamp(band.bend ?? 0, -0.24, 0.24)),
      );
    const points = Array.from({length: BAND_SEGMENTS + 1}, (_, index) =>
      quadraticPoint(from, control, to, index / BAND_SEGMENTS),
    );
    const width = clamp(band.width, 0.018, 0.11);
    // Beyond six widths exp(-(distance / width)^4) underflows to exactly zero.
    // A conservative expanded box avoids unnecessary segment distances there.
    const reach = width * 6;
    return points.slice(0, -1).map((point, index) => ({
      a: point,
      b: points[index + 1],
      minimumX: Math.min(point.x, points[index + 1].x) - reach,
      maximumX: Math.max(point.x, points[index + 1].x) + reach,
      minimumY: Math.min(point.y, points[index + 1].y) - reach,
      maximumY: Math.max(point.y, points[index + 1].y) + reach,
      strength: clamp(band.strength, 0, 1),
      width,
    }));
  });

const anatomyEmbeddings = new WeakMap<QuantumQuilMaterialAnatomy, (point: QuantumQuilMaterialPoint) => QuantumQuilMaterialPoint>();

const createAnatomyEmbedding = (anatomy: QuantumQuilMaterialAnatomy) => {
  const cached = anatomyEmbeddings.get(anatomy);
  if (cached) return cached;
  const harmonics = anatomy.body.harmonics.slice(0, 6);
  const lobes = anatomy.body.lobes.slice(0, 6);
  const lobeMeans = lobes.map(
    (lobe) =>
      Array.from({length: SILHOUETTE_SAMPLES}, (_, index) => {
        const angle = index / SILHOUETTE_SAMPLES * TAU;
        return Math.exp(
          clamp(lobe.concentration, 1.5, 10) *
            (Math.cos(angle - lobe.angle) - 1),
        );
      }).reduce((sum, value) => sum + value, 0) / SILHOUETTE_SAMPLES,
  );

  const rawRadiusAt = (angle: number) => {
    const harmonicRadius = harmonics.reduce(
      (sum, harmonic) =>
        sum +
        clamp(harmonic.amplitude, -0.14, 0.14) *
          Math.cos(harmonic.order * angle + harmonic.phase),
      0,
    );
    const lobeRadius = lobes.reduce((sum, lobe, index) => {
      const bump = Math.exp(
        clamp(lobe.concentration, 1.5, 10) *
          (Math.cos(angle - lobe.angle) - 1),
      );
      return sum + clamp(lobe.amplitude, 0, 0.16) * (bump - lobeMeans[index]);
    }, 0);
    return Math.max(0.62, 1 + harmonicRadius + lobeRadius);
  };

  const areaNormalization = Math.sqrt(
    Array.from({length: SILHOUETTE_SAMPLES}, (_, index) => {
      const radius = rawRadiusAt(index / SILHOUETTE_SAMPLES * TAU);
      return radius * radius;
    }).reduce((sum, value) => sum + value, 0) / SILHOUETTE_SAMPLES,
  );
  const aspect = clamp(anatomy.body.aspect, 0.72, 1.38);
  const aspectX = Math.sqrt(aspect);
  const aspectY = 1 / aspectX;
  const bodyScale = clamp(anatomy.body.scale, 0.86, 1.08);

  const embed = (point: QuantumQuilMaterialPoint): QuantumQuilMaterialPoint => {
    const radius = lengthOf(point);
    const angle = Math.atan2(point.y, point.x);
    const edgeRadius = clamp(rawRadiusAt(angle) / areaNormalization, 0.72, 1.3);
    const shaped = {
      x: Math.cos(angle) * radius * edgeRadius * aspectX,
      y: Math.sin(angle) * radius * edgeRadius * aspectY,
    };
    return scale(rotate(shaped, anatomy.body.rotation), bodyScale);
  };
  anatomyEmbeddings.set(anatomy, embed);
  return embed;
};

const createMaterialInvariants = ({
  anatomy,
  seed,
}: Pick<QuantumQuilGenerativeOrganismProps, "anatomy" | "seed">) => {
  const seedPhase = random(`${seed}:material-phase`) * TAU;
  const streamAngle = random(`${seed}:material-stream-axis`) * TAU;
  const streamAxis = {x: Math.cos(streamAngle), y: Math.sin(streamAngle)};
  const crossAxis = {x: -streamAxis.y, y: streamAxis.x};
  const bandSegments = materializeBandSegments(anatomy);
  const sources: FlowSource[] = [
    ...anatomy.cavities.slice(0, 3).map((cavity, index) => ({
      center: cavity.center,
      polarity: cavity.polarity ?? (index % 2 === 0 ? 1 : -1),
      radius: clamp(Math.max(cavity.radii.x, cavity.radii.y) * 1.45 + 0.08, 0.18, 0.38),
      strength: clamp(cavity.sourceStrength, 0.2, 1),
    })),
    ...anatomy.nodes.slice(0, 5).map((node) => ({
      center: node.center,
      polarity: node.polarity,
      radius: clamp(node.radius, 0.07, 0.28),
      strength: clamp(node.strength, 0.15, 1),
    })),
  ];
  if (sources.length === 0) {
    sources.push({
      center: {x: 0.17, y: -0.13},
      polarity: 1,
      radius: 0.31,
      strength: 1,
    });
  }

  const accentCache = new WeakMap<QuantumQuilMaterialPoint, FieldAccent>();
  const accent = (point: QuantumQuilMaterialPoint): FieldAccent => {
    const cached = accentCache.get(point);
    if (cached) return cached;
    let band = 0;
    for (const segment of bandSegments) {
      if (point.x < segment.minimumX || point.x > segment.maximumX || point.y < segment.minimumY || point.y > segment.maximumY) continue;
      const distance = distanceToSegment(point, segment.a, segment.b);
      band = Math.max(
        band,
        Math.exp(-Math.pow(distance / segment.width, 4)) * segment.strength,
      );
    }

    let node = 0;
    for (const source of sources) {
      const reach = Math.max(0.035, source.radius * 0.62) * 6;
      if (Math.abs(point.x - source.center.x) > reach || Math.abs(point.y - source.center.y) > reach) continue;
      const distance = Math.hypot(
        point.x - source.center.x,
        point.y - source.center.y,
      );
      node = Math.max(
        node,
        Math.exp(-Math.pow(distance / Math.max(0.035, source.radius * 0.62), 4)) *
          source.strength,
      );
    }

    const result = {
      band: clamp(band, 0, 1),
      node: clamp(node, 0, 1),
      total: clamp(Math.max(band, node * 0.82), 0, 1),
    };
    accentCache.set(point, result);
    return result;
  };

  const sourceCoordinateCache = new WeakMap<QuantumQuilMaterialPoint, {angle: number; radial: QuantumQuilMaterialPoint; rho: number}>();
  const sourceCoordinates = (point: QuantumQuilMaterialPoint) => {
    const cached = sourceCoordinateCache.get(point);
    if (cached) return cached;
    const totalStrength = sources.reduce((sum, source) => sum + source.strength, 0);
    let exponentialSum = 0;
    let direction = {x: 0, y: 0};

    for (const source of sources) {
      const delta = {
        x: (point.x - source.center.x) / 1.05,
        y: (point.y - source.center.y) / 0.82,
      };
      const rho = Math.max(0.0001, lengthOf(delta));
      const weight = source.strength * Math.exp(-8 * rho);
      exponentialSum += weight;
      direction = add(direction, scale(normalize(delta), weight));
    }

    const rho =
      -(Math.log(Math.max(1e-9, exponentialSum)) - Math.log(Math.max(1e-9, totalStrength))) /
      8;
    const radial = lengthOf(direction) > 0.0001 ? normalize(direction) : {x: 1, y: 0};
    const result = {
      angle: Math.atan2(radial.y, radial.x),
      radial,
      rho: Math.max(0, rho),
    };
    sourceCoordinateCache.set(point, result);
    return result;
  };

  return {accent, sourceCoordinates, seedPhase, streamAxis, crossAxis, sources};
};

const materialInvariants = new WeakMap<QuantumQuilMaterialAnatomy, Map<string, ReturnType<typeof createMaterialInvariants>>>();

const createMaterialField = ({anatomy, organism, seed, theta}: Pick<QuantumQuilGenerativeOrganismProps, "anatomy" | "organism" | "seed"> & {theta: number}): MaterialField => {
  let bySeed = materialInvariants.get(anatomy);
  if (!bySeed) {
    bySeed = new Map();
    materialInvariants.set(anatomy, bySeed);
  }
  let invariants = bySeed.get(seed);
  if (!invariants) {
    invariants = createMaterialInvariants({anatomy, seed});
    // Also bound unusual callers which reuse one anatomy for many seeds.
    if (bySeed.size >= 8) bySeed.clear();
    bySeed.set(seed, invariants);
  }
  const {accent, sourceCoordinates, seedPhase, streamAxis, crossAxis, sources} = invariants;

  const fieldSample = (point: QuantumQuilMaterialPoint): FieldSample => {
    const source = sourceCoordinates(point);
    const wavePhase = theta - 3.8 * source.rho - seedPhase;
    const activator = vonMisesPulse(wavePhase, 11);
    const inhibitor = vonMisesPulse(wavePhase - 0.62, 4.5);
    const excitation = activator - 0.56 * inhibitor;
    const conduction =
      0.5 +
      0.5 *
        Math.sin(
          theta -
            source.rho * 5.8 +
            0.35 * Math.sin(source.angle * 3 + seedPhase),
        );
    const electrical =
      0.5 +
      0.5 * Math.sin(theta * 5 + point.x * 2.4 - point.y * 1.7 + seedPhase * 0.7);
    const materialAccent = accent(point);
    const baseActivity =
      0.24 + 0.56 * smoothstep(0.43, 0.87, conduction * 0.72 + electrical * 0.28);
    const activity = clamp(
      baseActivity *
        (1 + materialAccent.band * 0.22 + materialAccent.node * 0.12),
      0,
      1,
    );

    return {...materialAccent, activator, activity, excitation};
  };

  let cortex = Array.from({length: BOUNDARY_SAMPLES}, (_, index) => {
    const angle = index / BOUNDARY_SAMPLES * TAU;
    return 0.034 * fieldSample({x: Math.cos(angle), y: Math.sin(angle)}).excitation;
  });

  for (let pass = 0; pass < 3; pass += 1) {
    cortex = cortex.map((value, index, values) => {
      const previous = values[mod(index - 1, values.length)];
      const next = values[mod(index + 1, values.length)];
      return previous * 0.25 + value * 0.5 + next * 0.25;
    });
  }

  const mean = cortex.reduce((sum, value) => sum + value, 0) / cortex.length;
  const cosine =
    2 / cortex.length *
    cortex.reduce(
      (sum, value, index) =>
        sum + value * Math.cos(index / cortex.length * TAU),
      0,
    );
  const sine =
    2 / cortex.length *
    cortex.reduce(
      (sum, value, index) =>
        sum + value * Math.sin(index / cortex.length * TAU),
      0,
    );
  cortex = cortex.map((value, index) => {
    const angle = index / cortex.length * TAU;
    return value - mean - cosine * Math.cos(angle) - sine * Math.sin(angle);
  });

  const cortexAt = (angle: number) => {
    const position = mod(angle, TAU) / TAU * cortex.length;
    const index = Math.floor(position);
    return mix(
      cortex[index],
      cortex[mod(index + 1, cortex.length)],
      position - index,
    );
  };

  const cortexDerivativeAt = (angle: number) => {
    const step = TAU / cortex.length;
    return (cortexAt(angle + step) - cortexAt(angle - step)) / (step * 2);
  };

  const streamVector = (
    point: QuantumQuilMaterialPoint,
    axis: QuantumQuilMaterialPoint,
  ) => {
    const radiusSquared = point.x * point.x + point.y * point.y;
    const boundary = Math.max(0, 1 - radiusSquared);
    const gate = boundary * boundary;
    const h = axis.x * point.y - axis.y * point.x;
    const derivativeX = -4 * point.x * boundary;
    const derivativeY = -4 * point.y * boundary;
    return {
      x: derivativeY * h + gate * axis.x,
      y: -(derivativeX * h - gate * axis.y),
    };
  };

  const map = (point: QuantumQuilMaterialPoint): QuantumQuilMaterialPoint => {
    const radius = lengthOf(point);
    const angle = Math.atan2(point.y, point.x);
    const source = sourceCoordinates(point);
    const tangent = {x: -source.radial.y, y: source.radial.x};
    const sample = fieldSample(point);
    const radiusSquared = point.x * point.x + point.y * point.y;
    const tissueGate = Math.pow(Math.max(0, 1 - radiusSquared), 1.5);

    const shuttle = add(
      scale(streamVector(point, streamAxis), 0.048 * Math.sin(theta)),
      scale(
        streamVector(point, crossAxis),
        0.017 * Math.sin(theta * 2 + seedPhase),
      ),
    );
    const wave = add(
      scale(source.radial, -0.024 * tissueGate * sample.excitation),
      scale(tangent, 0.0065 * tissueGate * sample.excitation),
    );
    const cortexRadial = {x: Math.cos(angle), y: Math.sin(angle)};
    const cortexTangent = {x: -cortexRadial.y, y: cortexRadial.x};
    const cortexMotion = add(
      scale(cortexRadial, Math.pow(radius, 2.4) * cortexAt(angle)),
      scale(
        cortexTangent,
        -0.12 * Math.pow(radius, 2.7) * cortexDerivativeAt(angle),
      ),
    );

    let sourceFlow = {x: 0, y: 0};
    for (const flowSource of sources) {
      const delta = {
        x: point.x - flowSource.center.x,
        y: point.y - flowSource.center.y,
      };
      const distance = Math.max(0.0001, lengthOf(delta));
      const radial = scale(delta, 1 / distance);
      const sourceTangent = {x: -radial.y, y: radial.x};
      const influence = Math.exp(
        -Math.pow(distance / flowSource.radius, 2) * 0.72,
      );
      const localFlow = add(
        scale(
          sourceTangent,
          influence *
            (0.012 + sample.activity * 0.026) *
            flowSource.strength *
            flowSource.polarity *
            (0.7 + organism.asymmetry * 0.3),
        ),
        scale(
          radial,
          influence *
            (0.006 + sample.activity * 0.014) *
            flowSource.strength *
            (1.08 - organism.membraneTension * 0.3),
        ),
      );
      sourceFlow = add(sourceFlow, localFlow);
    }

    sourceFlow = limitVector(sourceFlow, 0.052);
    return add(point, add(shuttle, add(wave, add(cortexMotion, sourceFlow))));
  };

  return {accent, map, sample: fieldSample};
};

const isInsideCavity = ({
  cavity,
  cavityIndex,
  field,
  point,
  row,
  seed,
}: {
  cavity: QuantumQuilMaterialCavity;
  cavityIndex: number;
  field: MaterialField;
  point: QuantumQuilMaterialPoint;
  row: number;
  seed: string;
}) => {
  const local = rotate(
    {x: point.x - cavity.center.x, y: point.y - cavity.center.y},
    -cavity.rotation,
  );
  const dx = local.x / Math.max(0.04, cavity.radii.x);
  const dy = local.y / Math.max(0.04, cavity.radii.y);
  const angle = Math.atan2(dy, dx);
  const boundary =
    1 +
    clamp(cavity.irregularity, 0, 0.18) *
      (0.68 * Math.sin(angle * 3 + cavity.phase3) +
        0.32 * Math.sin(angle * 5 + cavity.phase5));
  if (Math.hypot(dx, dy) >= boundary) {
    return false;
  }

  const porosity = clamp(cavity.bridgePorosity, 0, 0.42);
  const stableBridge =
    random(`${seed}:material-cavity-bridge:${cavityIndex}:${row}`) < porosity;
  const bandBridge =
    field.accent(point).band > 0.5 &&
    random(`${seed}:material-band-bridge:${cavityIndex}:${row}`) <
      Math.min(0.68, porosity * 1.85 + 0.08);
  return !(stableBridge || bandBridge);
};

const createTraceGrid = ({organism, seed, form}: Pick<QuantumQuilGenerativeOrganismProps, "organism" | "seed" | "form">) => {
  const formDensity = form === "echo-orb" ? 12 : form === "relay-orb" ? -9 : form === "veil-orb" ? 5 : 0;
  const lineCount = Math.round(62 + organism.filamentDensity * 48 + formDensity);
  const sampleCount = 132;
  return Array.from({length: lineCount}, (_, row) => {
    const rawVertical = row / (lineCount - 1) * 2 - 1;
    const seeded = random(`${seed}:material-trace:${row}`);
    const staticBunch = Math.sin(rawVertical * Math.PI * 3 + seeded * 3) * (0.012 + (1 - organism.membraneTension) * 0.015);
    const vertical = clamp(rawVertical + staticBunch, -1, 1);
    const halfWidth = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const centerWeight = Math.pow(Math.max(0, 1 - Math.abs(vertical)), 0.42);
    const cycles = 2.3 + row % 7 * 0.31 + seeded * 0.92;
    const rowPhase = row * 0.37 + seeded * 9;
    const points = Array.from({length: sampleCount}, (_, pointIndex) => {
      const t = pointIndex / (sampleCount - 1) * 2 - 1;
      const edgeFade = Math.pow(Math.max(0, 1 - t * t), 0.58);
      const basePoint = {
        x: t * halfWidth * (1 + t * organism.asymmetry * 0.055) + Math.sin(t * Math.PI * 8 + rowPhase) * (0.6 + organism.nervousness * 1.2) / BODY_RADIUS,
        y: vertical + vertical * organism.asymmetry * 8 / BODY_RADIUS,
      };
      return {t, edgeFade, basePoint};
    });
    return {row, seeded, vertical, centerWeight, cycles, rowPhase, points,
      stableScar: random(`${seed}:material-stable-scar:${row}`),
      scarCenter: -0.62 + random(`${seed}:material-scar-position:${row}`) * 1.24};
  });
};

const traceGrids = new WeakMap<QuantumQuilGenerativeOrganismProps["organism"], Map<string, ReturnType<typeof createTraceGrid>>>();
const getTraceGrid = (props: Pick<QuantumQuilGenerativeOrganismProps, "organism" | "seed" | "form">) => {
  let entries = traceGrids.get(props.organism);
  if (!entries) {
    entries = new Map();
    traceGrids.set(props.organism, entries);
  }
  const key = `${props.seed}:${props.form}`;
  let grid = entries.get(key);
  if (!grid) {
    grid = createTraceGrid(props);
    if (entries.size >= 8) entries.clear();
    entries.set(key, grid);
  }
  return grid;
};

const makeLivingTraceField = ({
  anatomy,
  fault,
  form,
  organism,
  seed,
  signal,
  theta,
}: Pick<
  QuantumQuilGenerativeOrganismProps,
  "anatomy" | "form" | "organism" | "seed" | "signal"
> & {
  fault: SignalFault;
  theta: number;
}): MaterialTrace[] => {
  const field = createMaterialField({anatomy, organism, seed, theta});
  const embed = createAnatomyEmbedding(anatomy);

  return getTraceGrid({organism, seed, form}).map(({row, vertical, seeded, centerWeight, cycles, rowPhase, points, stableScar, scarCenter}) => {
    const rowActivity = field.sample({x: 0, y: vertical}).activity;
    const scanEnvelope = Math.max(
      0,
      1 - Math.abs(vertical - fault.scanCenter) / Math.max(0.001, fault.scanWidth),
    );
    const interruptedRow = scanEnvelope * fault.strength;
    const rowTear = random(`${seed}:material-fault-row:${fault.eventIndex}:${row}`);
    const rowDropped =
      interruptedRow > 0.1 &&
      random(`${seed}:material-row-drop:${fault.eventIndex}:${row}`) <
        interruptedRow * signal.dropout * 0.72;
    const xOffset =
      rowTear > 0.66
        ? fault.polarity *
          (rowTear - 0.66) *
          interruptedRow *
          (150 + organism.nervousness * 210)
        : 0;
    const yOffset = interruptedRow * (rowTear - 0.5) * (18 + signal.collapse * 48);
    let drawing = false;
    let accentDrawing = false;
    let maximumAccent = 0;
    const commands: string[] = [];
    const accentCommands: string[] = [];

    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const {t, edgeFade, basePoint} = points[pointIndex];
      const local = field.sample(basePoint);
      const localPhase =
        local.excitation * 0.35 +
        Math.sin(theta) * (basePoint.x * 0.045 - basePoint.y * 0.032);
      let voltage =
        Math.sin(t * Math.PI * 2 * cycles + rowPhase + localPhase) * 0.58 +
        Math.sin(
          t * Math.PI * 2 * (cycles * 1.91) +
            rowPhase * 1.33 -
            localPhase * 0.7,
        ) * 0.27 +
        Math.sin(
          t * Math.PI * 2 * (0.62 + seeded * 0.48) +
            vertical * 4.8 +
            localPhase * 0.4,
        ) * 0.15;
      const faultBand = Math.max(0, 1 - Math.abs(t - fault.xCenter) / fault.xWidth);
      const interruptedSignal = faultBand * fault.strength;
      const quantization = 3 + Math.round((1 - signal.hold) * 8);
      const heldVoltage = Math.round(voltage * quantization) / quantization;
      voltage += (heldVoltage - voltage) * interruptedSignal * signal.hold;
      voltage *= 1 - interruptedSignal * signal.collapse * 0.92;

      const amplitude =
        (5 +
          seeded * 6 +
          organism.nervousness * 7 +
          local.activity *
            (23 + seeded * 24) *
            (1.18 - organism.membraneTension * 0.36)) *
        (0.34 + centerWeight * 0.72) *
        (1 + local.activator * 0.24) *
        (1 + local.band * 0.18);
      const materialPoint = {
        x: basePoint.x,
        y: basePoint.y + voltage * amplitude * edgeFade / BODY_RADIUS,
      };
      const mapped = embed(field.map(materialPoint));
      const x = BODY_CENTER.x + mapped.x * BODY_RADIUS + xOffset;
      const y =
        BODY_CENTER.y +
        mapped.y * BODY_RADIUS +
        yOffset +
        interruptedSignal * (rowTear - 0.5) * (10 + signal.collapse * 36);

      const scarGap =
        stableScar > 0.91 &&
        Math.abs(t - scarCenter) < 0.018 + organism.memory * 0.014;
      const packet = Math.floor(pointIndex / 4);
      const faultGap =
        interruptedSignal > 0.08 &&
        random(`${seed}:material-fault-packet:${fault.eventIndex}:${row}:${packet}`) <
          interruptedSignal * signal.dropout * 0.92;
      const cavityGap = anatomy.cavities.slice(0, 3).some((cavity, cavityIndex) =>
        isInsideCavity({
          cavity,
          cavityIndex,
          field,
          point: materialPoint,
          row,
          seed,
        }),
      );
      const blanked = cavityGap || scarGap || faultGap || rowDropped;

      if (blanked) {
        drawing = false;
        accentDrawing = false;
        continue;
      }

      commands.push(`${drawing ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`);
      drawing = true;

      const pointAccent = field.accent(materialPoint).total;
      maximumAccent = Math.max(maximumAccent, pointAccent);
      if (pointAccent > 0.34) {
        accentCommands.push(
          `${accentDrawing ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`,
        );
        accentDrawing = true;
      } else {
        accentDrawing = false;
      }
    }

    const dropout = random(`${seed}:material-dash:${fault.eventIndex}:${row}`);
    const width =
      0.52 +
      seeded * 0.7 +
      rowActivity * 0.42 +
      organism.membraneTension * 0.14;
    return {
      accentD: accentCommands.join(" "),
      accentOpacity: 0.12 + maximumAccent * 0.36,
      accentWidth: width * (1.16 + maximumAccent * 0.28),
      activity: rowActivity,
      d: commands.join(" "),
      dash:
        dropout > 0.88 || interruptedRow * signal.dropout > 0.18
          ? `${6 + seeded * 11} ${2 + (1 - seeded) * 12}`
          : `${58 + seeded * 86} ${1.5 + seeded * 3.2}`,
      opacity: 0.16 + centerWeight * 0.32 + seeded * 0.14 + rowActivity * 0.18,
      width,
    };
  });
};

export type MaterialFrameTraces = [MaterialTrace[], MaterialTrace[], MaterialTrace[]];

/** Exact material-v1 geometry, shared by the synchronous renderer and its worker. */
export const prepareMaterialFrame = (
  props: QuantumQuilGenerativeOrganismProps,
  frame: number,
  durationInFrames: number,
): MaterialFrameTraces => {
  const loopPhase = frame / durationInFrames;
  const theta = loopPhase * TAU * 2;
  const frameStep = TAU * 2 / durationInFrames;
  return [0, 2, 6].map(offset => makeLivingTraceField({
    anatomy: props.anatomy,
    fault: getSignalFault({
      loopPhase: offset === 0 ? loopPhase : fract(loopPhase - offset / durationInFrames),
      seed: props.seed,
      signal: props.signal,
    }),
    form: props.form,
    organism: props.organism,
    seed: props.seed,
    signal: props.signal,
    theta: theta - frameStep * offset,
  })) as MaterialFrameTraces;
};

const MaterialPhosphorBody = ({props, frame, durationInFrames, idPrefix, traces}: {
  props: QuantumQuilGenerativeOrganismProps;
  frame: number;
  durationInFrames: number;
  idPrefix: string;
  traces?: MaterialFrameTraces;
}) => {
  const [current, memoryA, memoryB] = useMemo(
    () => traces ?? prepareMaterialFrame(props, frame, durationInFrames),
    [traces, props, frame, durationInFrames],
  );
  const noiseSeed = Math.floor(random(`${props.seed}:material-warp`) * 9000) + 100;

  const paths = (
    traces: MaterialTrace[],
    key: string,
    opacity: number,
    offset = 0,
    includeAccents = false,
  ) => (
    <g opacity={opacity} transform={`translate(${offset} ${offset * -0.35})`}>
      {traces.map((trace, row) => (
        <React.Fragment key={`${key}-${row}`}>
          <path
            d={trace.d}
            fill="none"
            opacity={trace.opacity}
            stroke={`url(#${idPrefix}-quantum-quil-material-phosphor)`}
            strokeDasharray={trace.dash}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={trace.width}
            vectorEffect="non-scaling-stroke"
          />
          {includeAccents && trace.accentD ? (
            <path
              d={trace.accentD}
              fill="none"
              opacity={trace.accentOpacity}
              stroke={props.highlight}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={trace.accentWidth}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </React.Fragment>
      ))}
    </g>
  );

  return (
    <g>
      <defs>
        <linearGradient
          id={`${idPrefix}-quantum-quil-material-phosphor`}
          x1="13%"
          x2="92%"
          y1="20%"
          y2="78%"
        >
          <stop offset="0%" stopColor={props.accent} stopOpacity="0.74" />
          <stop offset="48%" stopColor={props.highlight} />
          <stop offset="83%" stopColor={props.accent} stopOpacity="0.86" />
          <stop offset="100%" stopColor={props.secondary} stopOpacity="0.5" />
        </linearGradient>
        <filter
          id={`${idPrefix}-quantum-quil-material-warp`}
          height="136%"
          width="136%"
          x="-18%"
          y="-18%"
        >
          <feTurbulence
            baseFrequency="0.012 0.036"
            numOctaves="2"
            result="warp"
            seed={noiseSeed + 89}
            type="fractalNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="warp"
            scale={8 + props.analogAmount * 9 + props.organism.nervousness * 7}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter
          id={`${idPrefix}-quantum-quil-material-bloom`}
          height="164%"
          width="164%"
          x="-32%"
          y="-32%"
        >
          <feGaussianBlur stdDeviation={3.2 + props.organism.memory * 2.3} />
        </filter>
      </defs>

      <g
        filter={`url(#${idPrefix}-quantum-quil-material-bloom)`}
        opacity={0.2 + props.organism.memory * 0.1}
      >
        {paths(current, "bloom", 1)}
      </g>
      <g filter={`url(#${idPrefix}-quantum-quil-material-warp)`}>
        {paths(memoryB, "memory-b", 0.045 + props.organism.memory * 0.04, -2.6)}
        {paths(memoryA, "memory-a", 0.085 + props.organism.memory * 0.06, -1.2)}
        {paths(current, "current", 0.96, 0, true)}
      </g>
      <g
        fill="none"
        opacity="0.028"
        stroke="#d92f57"
        strokeWidth="1.1"
        transform="translate(2.2 0.6)"
      >
        {current.filter((_, index) => index % 4 === 0).map((trace, index) => (
          <path d={trace.d} key={`oxide-${index}`} />
        ))}
      </g>
    </g>
  );
};

export const DEFAULT_QUANTUM_QUIL_MATERIAL_ANATOMY: QuantumQuilMaterialAnatomy = {
  version: "material-v1",
  fingerprint: "material-v1-default-bilobed-0005",
  body: {
    aspect: 1.08,
    family: "bilobed",
    harmonics: [
      {amplitude: 0.052, order: 2, phase: 0.72},
      {amplitude: 0.028, order: 3, phase: 2.14},
      {amplitude: 0.016, order: 5, phase: 4.82},
    ],
    lobes: [
      {amplitude: 0.105, angle: 0.28, concentration: 4.8},
      {amplitude: 0.072, angle: 3.68, concentration: 5.6},
    ],
    rotation: 0.24,
    scale: 0.97,
  },
  cavities: [
    {
      bridgePorosity: 0.18,
      center: {x: 0.2, y: -0.18},
      irregularity: 0.11,
      phase3: 0.8,
      phase5: 4.2,
      polarity: 1,
      radii: {x: 0.16, y: 0.105},
      rotation: 0.34,
      sourceStrength: 0.9,
    },
    {
      bridgePorosity: 0.12,
      center: {x: -0.31, y: 0.22},
      irregularity: 0.075,
      phase3: 3.4,
      phase5: 1.1,
      polarity: -1,
      radii: {x: 0.105, y: 0.135},
      rotation: -0.52,
      sourceStrength: 0.68,
    },
  ],
  bands: [
    {
      bend: 0.08,
      from: {kind: "cavity", index: 0},
      strength: 0.48,
      to: {kind: "cavity", index: 1},
      width: 0.058,
    },
    {
      bend: -0.06,
      from: {kind: "cavity", index: 0},
      strength: 0.34,
      to: {kind: "node", index: 0},
      width: 0.043,
    },
  ],
  nodes: [
    {
      center: {x: 0.34, y: 0.31},
      polarity: -1,
      radius: 0.13,
      strength: 0.62,
    },
    {
      center: {x: -0.08, y: -0.42},
      polarity: 1,
      radius: 0.105,
      strength: 0.44,
    },
  ],
};

export const DEFAULT_QUANTUM_QUIL_GENERATIVE_ORGANISM_PROPS: QuantumQuilGenerativeOrganismProps = {
  ...DEFAULT_QUANTUM_QUIL_PROPS,
  anatomy: DEFAULT_QUANTUM_QUIL_MATERIAL_ANATOMY,
  audio: "",
  edition: 5,
  seed: "quantum-quil:material-v1:0005",
  title: "Material Organism 0005",
  utility: "Silent generative organism proof",
};

export const getQuantumQuilGenerativeOrganismLoopSpec = (
  props: Pick<QuantumQuilGenerativeOrganismProps, "bpm" | "loopBeats" | "seed">,
) => getQuantumQuilLoopSpec(props);

export const QUANTUM_QUIL_GENERATIVE_ORGANISM_DEFAULT_DURATION =
  getQuantumQuilGenerativeOrganismLoopSpec(
    DEFAULT_QUANTUM_QUIL_GENERATIVE_ORGANISM_PROPS,
  ).durationInFrames;


export {MaterialPhosphorBody};
export const QUANTUM_QUIL_GENERATIVE_ORGANISM_FPS = QUANTUM_QUIL_FPS;
