import React, {forwardRef, useId} from "react";
import {MaterialPhosphorBody, getQuantumQuilGenerativeOrganismLoopSpec} from "./material";
import type {QuantumQuilGenerativeOrganismProps} from "./material";
import {random} from "./random";
import type {PreparedWavIdFrame} from "./usePreparedWavIdFrame";

export type WavIdRendererProps = {
  props: QuantumQuilGenerativeOrganismProps;
  /** Frame on the original 30 fps timeline. Fractions are allowed. */
  frame: number;
  /** Optional exact geometry prepared by usePreparedWavIdFrame. */
  preparedFrame?: PreparedWavIdFrame;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * A self-contained square SVG: no Remotion player, audio, fetches, or fonts.
 * Keep definition.props immutable; the studio owns timeline and motion policy.
 */
export const WavIdRenderer = forwardRef<SVGSVGElement, WavIdRendererProps>(
  function WavIdRenderer({props, frame, preparedFrame, title, className, style}, ref) {
    const id = `wavid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const {durationInFrames} = getQuantumQuilGenerativeOrganismLoopSpec(props);
    const wrappedFrame = ((frame % durationInFrames) + durationInFrames) % durationInFrames;
    if (preparedFrame && (preparedFrame.props !== props || preparedFrame.frame !== wrappedFrame)) {
      throw new Error("Prepared waveform geometry must match its definition and displayed frame.");
    }
    const filmFrame = Math.floor(wrappedFrame);
    const analog = props.analogAmount;
    const grainSeed = Math.floor(random(`${props.seed}:material-film:${filmFrame}`) * 9900) + 10;
    const dustWindow = Math.floor(filmFrame / 3);
    const svgTitle = title ?? props.title ?? "WavID waveform";
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width="1080"
        height="1080"
        viewBox="0 0 1080 1080"
        role="img"
        aria-labelledby={`${id}-title ${id}-description`}
        className={className}
        data-frame={wrappedFrame}
        data-fingerprint={props.anatomy.fingerprint}
        style={{display: "block", width: "100%", height: "auto", isolation: "isolate", ...style}}
      >
        <title id={`${id}-title`}>{svgTitle}</title>
        <desc id={`${id}-description`}>
          A deterministic {props.anatomy.body.family} waveform with {props.anatomy.cavities.length} cavities,
          {` ${props.anatomy.bands.length}`} connective bands and {props.anatomy.nodes.length} flow nodes.
        </desc>
        <defs>
          <clipPath id={`${id}-artboard`} clipPathUnits="userSpaceOnUse">
            <rect width="1080" height="1080" />
          </clipPath>
          <radialGradient id={`${id}-accent-haze`} cx="48%" cy="50%" r="72.15%">
            <stop offset="0" stopColor={props.accent} stopOpacity={11 / 255} />
            <stop offset=".48" stopColor={props.accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-secondary-haze`} cx="53%" cy="57%" r="77.85%">
            <stop offset="0" stopColor={props.secondary} stopOpacity={8 / 255} />
            <stop offset=".42" stopColor={props.secondary} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-vignette`} cx="50%" cy="50%" r="70.710678%">
            <stop offset=".45" stopColor="#000504" stopOpacity="0" />
            <stop offset=".72" stopColor="#000504" stopOpacity=".32" />
            <stop offset="1" stopColor="#000000" stopOpacity=".94" />
          </radialGradient>
          <filter id={`${id}-film-grain`}>
            <feTurbulence baseFrequency="0.78" numOctaves="4" seed={grainSeed} stitchTiles="stitch" type="fractalNoise" />
            <feColorMatrix values="1.5 0 0 0 -0.22  0 1.4 0 0 -0.2  0 0 1.3 0 -0.18  0 0 0 0.82 0" />
          </filter>
          <linearGradient id={`${id}-scan-color`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity=".018" />
            <stop offset=".2" stopColor="white" stopOpacity=".018" />
            <stop offset=".4" stopColor="white" stopOpacity="0" />
            <stop offset=".8" stopColor="black" stopOpacity="0" />
            <stop offset="1" stopColor="black" stopOpacity=".26" />
          </linearGradient>
          <pattern id={`${id}-scanlines`} width="1080" height="5" patternUnits="userSpaceOnUse">
            <rect width="1080" height="5" fill={`url(#${id}-scan-color)`} />
          </pattern>
        </defs>
        <g clipPath={`url(#${id}-artboard)`}>
        <rect width="1080" height="1080" fill={props.background} />
        <g
          transform="translate(-6.48 -6.48) scale(1.012)"
          style={{filter: `blur(${0.4 + analog * 0.48}px) contrast(${1.1 + analog * 0.18}) saturate(${0.66 + analog * 0.28})`}}
        >
          <rect width="1080" height="1080" fill={`url(#${id}-secondary-haze)`} />
          <rect width="1080" height="1080" fill={`url(#${id}-accent-haze)`} />
          <MaterialPhosphorBody props={props} frame={wrappedFrame} durationInFrames={durationInFrames} idPrefix={id} traces={preparedFrame?.traces} />
        </g>
        <rect width="1080" height="1080" fill="black" filter={`url(#${id}-film-grain)`} opacity={0.48 * analog} style={{mixBlendMode: "overlay"}} />
        {Array.from({length: 220}, (_, index) => {
          const x = random(`${props.seed}:material-grit-x:${filmFrame}:${index}`) * 1080;
          const y = random(`${props.seed}:material-grit-y:${filmFrame}:${index}`) * 1080;
          const size = 0.7 + random(`${props.seed}:material-grit-size:${filmFrame}:${index}`) * 2.4;
          return <rect key={`grit-${index}`} x={x} y={y} height={size} width={size * (index % 13 === 0 ? 4.2 : 1)} fill={index % 7 === 0 ? "#020000" : "#d2e3d9"} opacity={(0.05 + random(`${props.seed}:material-grit-alpha:${filmFrame}:${index}`) * 0.2) * analog} />;
        })}
        {Array.from({length: 14}, (_, index) => {
          const x = random(`${props.seed}:material-dust-x:${dustWindow}:${index}`) * 1080;
          const y = random(`${props.seed}:material-dust-y:${dustWindow}:${index}`) * 1080;
          const scratch = index < 3 && random(`${props.seed}:material-scratch:${dustWindow}:${index}`) > 0.5;
          const width = scratch ? 1 : 1.5 + index % 4;
          const height = scratch ? 110 + index * 34 : 1.5 + index % 4;
          return <rect key={`dust-${index}`} x={x} y={y} width={width} height={height} rx={scratch ? 0 : width / 2} fill={index % 4 === 0 ? "#050000" : "#dae4da"} opacity={(0.09 + index % 5 * 0.04) * analog} transform={scratch ? `rotate(${-0.8 + index * 0.3} ${x + width / 2} ${y + height / 2})` : undefined} style={scratch ? {filter: "blur(0.35px)"} : undefined} />;
        })}
        <rect width="1080" height="1080" fill={`url(#${id}-scanlines)`} opacity={0.82 * analog} style={{mixBlendMode: "overlay"}} />
        <rect width="1080" height="1080" fill={`url(#${id}-vignette)`} />
        </g>
      </svg>
    );
  },
);
