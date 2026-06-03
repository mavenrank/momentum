export type NoteType = 'daily' | 'weekly';

export interface Note {
  id: string;
  content: string;
  date: string;
  type: NoteType;
  createdAt: string;
}
