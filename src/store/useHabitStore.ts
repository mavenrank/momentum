import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Habit, HabitTracking } from '../types/habit';
import { generateId } from '../utils/id';

interface HabitStore {
  habits: Habit[];
  tracking: HabitTracking;
  addHabit: (name: string, goal: string) => void;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;
  toggleTracking: (habitId: string, date: string) => void;
  isTracked: (habitId: string, date: string) => boolean;
  getWeekTrackings: (habitId: string, weekDates: string[]) => boolean[];
  getTodayTrackings: () => { habitId: string; name: string; done: boolean }[];
}

export const useHabitStore = create<HabitStore>()(
  persist(
    (set, get) => ({
      habits: [],
      tracking: {},

      addHabit: (name, goal) => {
        const habit: Habit = { id: generateId(), name, goal, createdAt: new Date().toISOString() };
        set((state) => ({ habits: [...state.habits, habit] }));
      },

      updateHabit: (id, updates) => {
        set((state) => ({
          habits: state.habits.map((h) => (h.id === id ? { ...h, ...updates } : h)),
        }));
      },

      deleteHabit: (id) => {
        set((state) => {
          const { [id]: _, ...rest } = state.tracking;
          return { habits: state.habits.filter((h) => h.id !== id), tracking: rest };
        });
      },

      toggleTracking: (habitId, date) => {
        set((state) => {
          const current = state.tracking[habitId]?.[date] ?? false;
          return {
            tracking: {
              ...state.tracking,
              [habitId]: { ...state.tracking[habitId], [date]: !current },
            },
          };
        });
      },

      isTracked: (habitId, date) => {
        return get().tracking[habitId]?.[date] ?? false;
      },

      getWeekTrackings: (habitId, weekDates) => {
        const track = get().tracking[habitId] ?? {};
        return weekDates.map((d) => track[d] ?? false);
      },

      getTodayTrackings: () => {
        const today = new Date().toISOString().split('T')[0];
        return get().habits.map((h) => ({
          habitId: h.id,
          name: h.name,
          done: get().isTracked(h.id, today),
        }));
      },
    }),
    { name: 'momentum-habits' }
  )
);
