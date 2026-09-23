import type { Area } from "../types/planner";

export interface AreaSeed {
  name: string;
  color: string;
  /** CSS custom property that carries the dark-mode override. */
  cssVar: string;
}

export const DEFAULT_AREA_SEEDS: AreaSeed[] = [
  { name: "College", color: "#287c76", cssVar: "--area-college" },
  { name: "Work", color: "#a45c40", cssVar: "--area-work" },
  { name: "Projects", color: "#4a7c9e", cssVar: "--area-projects" },
  { name: "Health", color: "#5b8c5a", cssVar: "--area-health" },
  { name: "Personal", color: "#8e6b8e", cssVar: "--area-personal" },
  { name: "Finance", color: "#c49a3c", cssVar: "--area-finance" },
  { name: "Relationships", color: "#c06060", cssVar: "--area-relationships" },
];

/** Colors handed to areas the user creates on the fly, in rotation. */
const CUSTOM_AREA_COLORS = [
  "#6b8f9e",
  "#9e7b6b",
  "#7d8f6b",
  "#8f6b7d",
  "#6b7d8f",
  "#8f836b",
];

/** Legacy seed list retained for v1 backup migration only. */
export function seedAreas(createId: () => string, createdAt: string): Array<Omit<Area, "domainId">> {
  return DEFAULT_AREA_SEEDS.map((seed) => ({
    id: createId(),
    name: seed.name,
    color: seed.color,
    createdAt,
    archived: false,
  }));
}

/**
 * Puts areas in a stable, meaningful order: the built-in areas in their defined
 * order, then anything the user added, oldest first. IndexedDB hands rows back
 * keyed by a random UUID, so without this the list — and the `#` autocomplete —
 * would reshuffle between sessions.
 */
export function sortAreas(areas: Area[]): Area[] {
  const seedRank = new Map(
    DEFAULT_AREA_SEEDS.map((seed, index) => [normalizeAreaName(seed.name), index]),
  );

  return [...areas].sort((a, b) => {
    const rankA = seedRank.get(normalizeAreaName(a.name)) ?? Number.MAX_SAFE_INTEGER;
    const rankB = seedRank.get(normalizeAreaName(b.name)) ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name);
  });
}

export function nextCustomAreaColor(existingCount: number): string {
  return CUSTOM_AREA_COLORS[existingCount % CUSTOM_AREA_COLORS.length];
}

export function normalizeAreaName(name: string): string {
  return name.trim().toLowerCase();
}

export function findArea(areas: Area[], name: string | undefined): Area | undefined {
  if (!name) {
    return undefined;
  }
  const needle = normalizeAreaName(name);
  return areas.find((area) => area.id === name || normalizeAreaName(area.name) === needle);
}

export function areaName(areas: Area[], areaId: string | undefined): string | undefined {
  return findArea(areas, areaId)?.name;
}

/**
 * Resolves the display color for an area. Default areas resolve through their
 * CSS custom property so dark mode can brighten them; custom areas fall back to
 * the stored hex.
 */
export function getAreaColor(areas: Area[], name: string | undefined): string {
  if (!name) {
    return "var(--area-default)";
  }

  const area = findArea(areas, name);
  if (!area) {
    return "var(--area-default)";
  }

  const seed = DEFAULT_AREA_SEEDS.find(
    (candidate) => normalizeAreaName(candidate.name) === normalizeAreaName(area.name),
  );
  if (seed && seed.color === area.color) {
    return `var(${seed.cssVar})`;
  }

  return area.color;
}

/** Fuzzy subsequence match used by the `#area` autocomplete. */
export function fuzzyMatchAreas(areas: Area[], query: string): Area[] {
  const needle = normalizeAreaName(query);
  const active = areas.filter((area) => !area.archived);

  if (!needle) {
    return active;
  }

  const scored = active
    .map((area) => {
      const haystack = normalizeAreaName(area.name);
      if (haystack.startsWith(needle)) {
        return { area, score: 0 };
      }
      if (haystack.includes(needle)) {
        return { area, score: 1 };
      }

      let cursor = 0;
      for (const char of haystack) {
        if (char === needle[cursor]) {
          cursor += 1;
        }
      }
      return cursor === needle.length ? { area, score: 2 } : null;
    })
    .filter((entry): entry is { area: Area; score: number } => entry !== null);

  scored.sort((a, b) => a.score - b.score || a.area.name.localeCompare(b.area.name));
  return scored.map((entry) => entry.area);
}
