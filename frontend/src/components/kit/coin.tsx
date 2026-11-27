import { useId } from "react";
import { cn } from "@/lib/utils";

// The site's coin (27 Nov 2026: redrawn so it reads as a coin, not a ball).
// A gold disc seen slightly from above: the coin's thickness shows underneath,
// a ridged rim, a raised inner face with a stamped star, and a shine. Plain
// SVG, so it stays sharp from the 28 px header chip to the big About coin.
// Size it with `size-*` classes, as before.
export function Coin3D({ className }: { className?: string }) {
  // Gradient ids must be unique per coin on the page.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const face = `${id}-face`;
  const inner = `${id}-inner`;
  const edge = `${id}-edge`;
  const shine = `${id}-shine`;
  const clip = `${id}-clip`;

  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("size-11 shrink-0 drop-shadow-[0_3px_4px_rgb(0_0_0/0.28)]", className)}
    >
      <defs>
        <linearGradient id={edge} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c47a0c" />
          <stop offset="1" stopColor="#8a4f05" />
        </linearGradient>
        <radialGradient id={face} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="0.55" stopColor="#f7b733" />
          <stop offset="1" stopColor="#d98a0e" />
        </radialGradient>
        <radialGradient id={inner} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#ffd969" />
          <stop offset="1" stopColor="#eea21c" />
        </radialGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clip}>
          <circle cx="32" cy="30" r="27" />
        </clipPath>
      </defs>

      {/* Thickness: the coin's side, showing below the face */}
      <circle cx="32" cy="34" r="27" fill={`url(#${edge})`} />

      {/* Face with a ridged rim */}
      <circle cx="32" cy="30" r="27" fill={`url(#${face})`} />
      <circle cx="32" cy="30" r="25.2" fill="none" stroke="#b8700c" strokeWidth="2.4" strokeDasharray="1.1 1.5" opacity=".7" />

      {/* Raised inner face: dark lower-right edge, light upper-left edge */}
      <circle cx="32.6" cy="30.8" r="19.5" fill="#b86f0a" opacity=".55" />
      <circle cx="31.4" cy="29.2" r="19.5" fill="#fff4cf" opacity=".9" />
      <circle cx="32" cy="30" r="19" fill={`url(#${inner})`} />

      {/* Stamped star: shadow, light edge, then the star itself */}
      <path d="m32 17.5 3.9 8.1 8.9 1.1-6.5 6.1 1.7 8.8L32 37.3l-8 4.3 1.7-8.8-6.5-6.1 8.9-1.1Z" fill="#fff3c4" transform="translate(-0.7 -0.7)" />
      <path d="m32 17.5 3.9 8.1 8.9 1.1-6.5 6.1 1.7 8.8L32 37.3l-8 4.3 1.7-8.8-6.5-6.1 8.9-1.1Z" fill="#a85f06" transform="translate(0.6 0.7)" />
      <path d="m32 17.5 3.9 8.1 8.9 1.1-6.5 6.1 1.7 8.8L32 37.3l-8 4.3 1.7-8.8-6.5-6.1 8.9-1.1Z" fill="#e0920f" />

      {/* Shine across the face */}
      <rect x="0" y="0" width="64" height="64" fill={`url(#${shine})`} clipPath={`url(#${clip})`} />
      <circle cx="32" cy="30" r="26.5" fill="none" stroke="#fff6d6" strokeWidth="0.9" opacity=".6" />
    </svg>
  );
}
