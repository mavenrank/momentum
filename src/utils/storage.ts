const STORE_KEYS = [
  'momentum-tasks',
  'momentum-habits',
  'momentum-habit-tracking',
  'momentum-notes',
  'momentum-goals',
  'momentum-weekly-plans',
] as const;

export function clearAllData(): void {
  STORE_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function getStoreSize(): string {
  let total = 0;
  STORE_KEYS.forEach((key) => {
    const val = localStorage.getItem(key);
    if (val) total += val.length;
  });
  return `${(total / 1024).toFixed(1)} KB`;
}
