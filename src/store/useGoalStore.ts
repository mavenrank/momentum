import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Goal } from '../types/goal';
import { generateId } from '../utils/id';

interface GoalStore {
  goals: Goal[];
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt'>) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
}

export const useGoalStore = create<GoalStore>()(
  persist(
    (set) => ({
      goals: [],

      addGoal: (goal) => {
        const newGoal: Goal = { ...goal, id: generateId(), createdAt: new Date().toISOString() };
        set((state) => ({ goals: [...state.goals, newGoal] }));
      },

      updateGoal: (id, updates) => {
        set((state) => ({
          goals: state.goals.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        }));
      },

      deleteGoal: (id) => {
        set((state) => ({ goals: state.goals.filter((g) => g.id !== id) }));
      },
    }),
    { name: 'momentum-goals' }
  )
);
