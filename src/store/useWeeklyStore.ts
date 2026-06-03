import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WeeklyPlan } from '../types/weekly';
import { generateId } from '../utils/id';

interface WeeklyStore {
  plans: WeeklyPlan[];
  getPlan: (weekId: string) => WeeklyPlan | undefined;
  upsertPlan: (weekId: string, focus: string, notes: string) => void;
}

export const useWeeklyStore = create<WeeklyStore>()(
  persist(
    (set, get) => ({
      plans: [],

      getPlan: (weekId) => {
        return get().plans.find((p) => p.weekOf === weekId);
      },

      upsertPlan: (weekId, focus, notes) => {
        set((state) => {
          const existing = state.plans.findIndex((p) => p.weekOf === weekId);
          if (existing >= 0) {
            const updated = [...state.plans];
            updated[existing] = { ...updated[existing], weeklyFocus: focus, notes };
            return { plans: updated };
          }
          return {
            plans: [
              ...state.plans,
              { id: generateId(), weekOf: weekId, weeklyFocus: focus, notes },
            ],
          };
        });
      },
    }),
    { name: 'momentum-weekly-plans' }
  )
);
