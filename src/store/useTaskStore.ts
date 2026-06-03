import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task, TaskPriority } from '../types/task';
import { generateId } from '../utils/id';

interface TaskStore {
  tasks: Task[];
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;
  getTasksByDate: (date: string) => Task[];
  getTasksByWeek: (weekId: string) => Task[];
  getTasksByPriority: (priority: TaskPriority) => Task[];
  getTasksByDayAndPriority: (dayOfWeek: string, priority: TaskPriority) => Task[];
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      tasks: [],

      addTask: (task) => {
        const newTask: Task = { ...task, id: generateId(), createdAt: new Date().toISOString() };
        set((state) => ({ tasks: [...state.tasks, newTask] }));
      },

      updateTask: (id, updates) => {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        }));
      },

      deleteTask: (id) => {
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
      },

      toggleTask: (id) => {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        }));
      },

      getTasksByDate: (date) => {
        return get().tasks.filter((t) => t.date === date);
      },

      getTasksByWeek: (weekId) => {
        return get().tasks.filter((t) => t.weekId === weekId);
      },

      getTasksByPriority: (priority) => {
        return get().tasks.filter((t) => t.priority === priority);
      },

      getTasksByDayAndPriority: (dayOfWeek, priority) => {
        return get().tasks.filter((t) => t.dayOfWeek === dayOfWeek && t.priority === priority);
      },
    }),
    { name: 'momentum-tasks' }
  )
);
