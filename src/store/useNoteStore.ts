import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Note, NoteType } from '../types/note';
import { generateId } from '../utils/id';

interface NoteStore {
  notes: Note[];
  getNote: (date: string, type: NoteType) => Note | undefined;
  upsertNote: (date: string, type: NoteType, content: string) => void;
}

export const useNoteStore = create<NoteStore>()(
  persist(
    (set, get) => ({
      notes: [],

      getNote: (date, type) => {
        return get().notes.find((n) => n.date === date && n.type === type);
      },

      upsertNote: (date, type, content) => {
        set((state) => {
          const existing = state.notes.findIndex((n) => n.date === date && n.type === type);
          if (existing >= 0) {
            const updated = [...state.notes];
            updated[existing] = { ...updated[existing], content };
            return { notes: updated };
          }
          return {
            notes: [
              ...state.notes,
              { id: generateId(), content, date, type, createdAt: new Date().toISOString() },
            ],
          };
        });
      },
    }),
    { name: 'momentum-notes' }
  )
);
