export interface Habit {
  id: string;
  name: string;
  goal: string;
  createdAt: string;
}

export type HabitTracking = Record<string, Record<string, boolean>>;
