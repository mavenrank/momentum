export interface ExportData {
  version: string;
  exportedAt: string;
  tasks: unknown[];
  habits: unknown[];
  habitTracking: unknown;
  notes: unknown[];
  goals: unknown[];
  weeklyPlans: unknown[];
}

export function exportAllData(): void {
  const data: ExportData = {
    version: '0.1.0',
    exportedAt: new Date().toISOString(),
    tasks: JSON.parse(localStorage.getItem('momentum-tasks') || '[]'),
    habits: JSON.parse(localStorage.getItem('momentum-habits') || '[]'),
    habitTracking: JSON.parse(localStorage.getItem('momentum-habit-tracking') || '{}'),
    notes: JSON.parse(localStorage.getItem('momentum-notes') || '[]'),
    goals: JSON.parse(localStorage.getItem('momentum-goals') || '[]'),
    weeklyPlans: JSON.parse(localStorage.getItem('momentum-weekly-plans') || '[]'),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `momentum-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importData(file: File): Promise<ExportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as ExportData;
        resolve(data);
      } catch {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
