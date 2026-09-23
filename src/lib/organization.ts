import type { Area, DailyTask, Domain, PlannerData, Pursuit } from "../types/planner";

const DOMAIN_SEEDS = [
  { name: "Work", color: "#a45c40" },
  { name: "Personal", color: "#8e6b8e" },
] as const;

export function seedDomains(createId: () => string, createdAt: string): Domain[] {
  return DOMAIN_SEEDS.map((seed) => ({ ...seed, id: createId(), createdAt, archived: false }));
}

export function seedOrganizedAreas(createId: () => string, createdAt: string, domains: Domain[]): Area[] {
  const work = domains.find((domain) => domain.name === "Work")!;
  const personal = domains.find((domain) => domain.name === "Personal")!;
  return [
    { name: "General", domainId: work.id, color: work.color },
    { name: "General", domainId: personal.id, color: personal.color },
    { name: "Health", domainId: personal.id, color: "#5b8c5a" },
    { name: "Finance", domainId: personal.id, color: "#c49a3c" },
    { name: "Relationships", domainId: personal.id, color: "#c06060" },
  ].map((area) => ({ ...area, id: createId(), createdAt, archived: false }));
}

export function domainOfArea(data: Pick<PlannerData, "domains" | "areas">, areaId: string | undefined): Domain | undefined {
  const area = data.areas.find((entry) => entry.id === areaId);
  return data.domains.find((domain) => domain.id === area?.domainId);
}

export function taskDomainId(data: Pick<PlannerData, "areas">, task: Pick<DailyTask, "area" | "domainId">): string | undefined {
  return task.area ? data.areas.find((area) => area.id === task.area)?.domainId : task.domainId;
}

export function areaPath(data: Pick<PlannerData, "domains" | "areas">, areaId: string | undefined): string | undefined {
  const area = data.areas.find((entry) => entry.id === areaId);
  if (!area) return undefined;
  const domain = data.domains.find((entry) => entry.id === area.domainId);
  return domain ? `${domain.name} / ${area.name}` : area.name;
}

export function areaAcceptsPursuit(pursuit: Pursuit, areaId: string | undefined): boolean {
  return Boolean(areaId && (pursuit.homeAreaId === areaId || pursuit.participatingAreaIds.includes(areaId)));
}

/** Resolve an ID, a unique name, or a qualified `Domain / Area` path. */
export function resolveArea(data: Pick<PlannerData, "domains" | "areas">, value: string | undefined, domainId?: string): Area | undefined {
  if (!value) return undefined;
  const exact = data.areas.find((area) => area.id === value);
  if (exact) return exact;
  const normalized = value.trim().toLowerCase();
  const scopedDomainId = domainId ? resolveDomain(data.domains, domainId)?.id ?? domainId : undefined;
  const matches = data.areas.filter((area) =>
    (!scopedDomainId || area.domainId === scopedDomainId) &&
    (area.name.toLowerCase() === normalized || areaPath(data, area.id)?.toLowerCase() === normalized),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function resolveDomain(domains: Domain[], value: string | undefined): Domain | undefined {
  return domains.find((domain) => domain.id === value || domain.name.toLowerCase() === value?.trim().toLowerCase());
}

export function sortDomainsForDisplay(domains: Domain[]): Domain[] {
  const priority = (name: string) => name === "Work" ? 0 : name === "Personal" ? 1 : name === "To organize" ? 3 : 2;
  return [...domains].sort((a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name));
}

/** Repair duplicate active Domains left by earlier imports without merging distinct Areas. */
export function consolidateDuplicateDomains(data: PlannerData): PlannerData {
  const tasks = Object.values(data.daily).flatMap((entry) => entry.tasks);
  const remap = new Map<string, string>();
  const groups = new Map<string, Domain[]>();
  for (const domain of data.domains.filter((entry) => !entry.archived)) {
    const key = domain.name.trim().toLocaleLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), domain]);
  }

  for (const duplicates of groups.values()) {
    if (duplicates.length < 2) continue;
    const ids = new Set(duplicates.map((domain) => domain.id));
    const names = data.areas.filter((area) => ids.has(area.domainId)).map((area) => area.name.trim().toLocaleLowerCase());
    // A name collision could represent two separate responsibilities. Leave it for manual review.
    if (new Set(names).size !== names.length) continue;
    const ranked = [...duplicates].sort((a, b) => {
      const references = (domain: Domain) => data.areas.filter((area) => area.domainId === domain.id).length
        + tasks.filter((task) => task.domainId === domain.id).length;
      return references(b) - references(a) || a.createdAt.localeCompare(b.createdAt);
    });
    for (const duplicate of ranked.slice(1)) remap.set(duplicate.id, ranked[0].id);
  }

  if (remap.size === 0) return data;
  return {
    ...data,
    domains: data.domains.filter((domain) => !remap.has(domain.id)),
    areas: data.areas.map((area) => remap.has(area.domainId)
      ? { ...area, domainId: remap.get(area.domainId)! } : area),
    daily: Object.fromEntries(Object.entries(data.daily).map(([date, entry]) => [date, {
      ...entry,
      tasks: entry.tasks.map((task) => task.domainId && remap.has(task.domainId)
        ? { ...task, domainId: remap.get(task.domainId)! } : task),
    }])),
  };
}
