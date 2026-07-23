import { useMemo } from "react";
import clsx from "clsx";

/**
 * Real campaign photography is shot per PART 2's art direction (luxury
 * hotels, concrete architecture, Mediterranean villas, golden hour) and
 * dropped into /public/images. Until those assets exist, every image slot
 * renders an editorial-toned placeholder — never a stock photo, never a
 * white ecommerce backdrop — so the layout, framing and motion read exactly
 * as they will once real photography lands.
 */

const SCENES = {
  hotel: ["#efe6d8", "#cfc0a5", "#8a7d68"],
  cafe: ["#e9ded0", "#c7b79a", "#6b6255"],
  coast: ["#f3efe6", "#c9d2cd", "#7d8b86"],
  architecture: ["#e6e2da", "#b6a996", "#262220"],
  street: ["#ece3d3", "#b89f80", "#4a4139"],
  villa: ["#f2ece0", "#d8c6a8", "#8a7256"],
  studio: ["#f7f3ec", "#ddd0ba", "#6b6255"],
  night: ["#2a2622", "#4a4139", "#0b0a09"],
} as const;

export type Scene = keyof typeof SCENES;

interface EditorialImageProps {
  scene: Scene;
  label?: string;
  index?: number;
  className?: string;
  aspect?: string;
  children?: React.ReactNode;
}

export function EditorialImage({
  scene,
  label,
  index = 0,
  className,
  aspect = "aspect-[4/5]",
  children,
}: EditorialImageProps) {
  const colors = SCENES[scene];
  const angle = useMemo(() => 105 + ((index * 37) % 90), [index]);

  return (
    <div
      className={clsx(
        "relative overflow-hidden bg-cream",
        aspect,
        className
      )}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(${angle}deg, ${colors[0]} 0%, ${colors[1]} 55%, ${colors[2]} 100%)`,
        }}
      />
      <div
        className="absolute inset-0 mix-blend-overlay opacity-[0.18]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="absolute inset-0 ring-1 ring-inset ring-black/5" />
      {label && (
        <span className="absolute bottom-4 left-4 text-[10px] tracking-luxe uppercase text-black/40">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
