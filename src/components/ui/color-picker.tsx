import * as React from "react";
import { Palette } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Midsaturation accents that remain visible against both app themes. */
export const COLOR_PRESETS = [
  { name: "Deep teal", hex: "#287c76" },
  { name: "Sea glass", hex: "#418a83" },
  { name: "Eucalyptus", hex: "#5b8c5a" },
  { name: "Sage", hex: "#7d8f6b" },
  { name: "Pine", hex: "#5c806b" },
  { name: "Olive", hex: "#8f836b" },
  { name: "Ocean", hex: "#4a7c9e" },
  { name: "Blue grey", hex: "#6b8f9e" },
  { name: "Denim", hex: "#5f6b8f" },
  { name: "Slate", hex: "#6b7d8f" },
  { name: "Periwinkle", hex: "#7985ad" },
  { name: "Iris", hex: "#776fa2" },
  { name: "Orchid", hex: "#8e6b8e" },
  { name: "Plum", hex: "#8f6b7d" },
  { name: "Mauve", hex: "#aa798f" },
  { name: "Rose", hex: "#b5747a" },
  { name: "Coral", hex: "#c06060" },
  { name: "Clay", hex: "#a45c40" },
  { name: "Copper", hex: "#b87959" },
  { name: "Cocoa", hex: "#9e7b6b" },
  { name: "Amber", hex: "#c49a3c" },
  { name: "Honey", hex: "#ab8d51" },
  { name: "Sand", hex: "#a19170" },
  { name: "Stone", hex: "#817e79" },
] as const;

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;

function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? `#${trimmed.replace(/^#/, "").toLowerCase()}` : null;
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const [hexDraft, setHexDraft] = React.useState(value);
  React.useEffect(() => setHexDraft(value), [value]);
  const nativeValue = normalizeHex(value) ?? COLOR_PRESETS[0].hex;

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-1">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">Choose a preset or your own color</p>
    </div>
    <div role="group" aria-label={`${label} presets`} className="grid w-fit grid-cols-8 gap-2 sm:grid-cols-12">
      {COLOR_PRESETS.map(({ name, hex }) => <button
        key={hex} type="button" title={`${name} · ${hex}`} aria-label={`${name}, ${hex}`} aria-pressed={value.toLowerCase() === hex}
        onClick={() => onChange(hex)} style={{ backgroundColor: hex }}
        className={cn(
          "size-7 rounded-full border border-foreground/15 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
          value.toLowerCase() === hex && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
        )}
      />)}
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="relative grid size-8 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border" style={{ backgroundColor: nativeValue }}>
          <Palette aria-hidden="true" className="size-4 text-white drop-shadow-sm" />
          <input type="color" value={nativeValue} onChange={(event) => onChange(event.target.value)} aria-label={`Choose custom color for ${label}`} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </span>
        Custom
      </label>
      <Input value={hexDraft} maxLength={7} spellCheck={false} aria-label={`Hex color for ${label}`} aria-description="Enter a six-digit hex color, such as #287c76"
        onChange={(event) => { const next = event.target.value; setHexDraft(next); const color = normalizeHex(next); if (color) onChange(color); }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
        onBlur={() => setHexDraft(value)}
        className="h-8 w-28 font-mono text-xs uppercase"
      />
    </div>
  </div>;
}

export function ColorPopover({ label, value, onChange }: ColorPickerProps) {
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`Change color for ${label}`} title={`Change color for ${label}`} className="grid size-8 shrink-0 place-items-center rounded-md border transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span aria-hidden="true" className="size-5 rounded-sm" style={{ backgroundColor: value }} />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[min(23rem,calc(100vw-2rem))]">
      <ColorPicker label={`${label} color`} value={value} onChange={onChange} />
    </PopoverContent>
  </Popover>;
}
