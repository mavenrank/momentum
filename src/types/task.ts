export type TaskPriority = 'top' | 'low' | 'follow-up' | 'todo';

export interface Task {
  id: string;
  text: string;
  done: boolean;
  priority: TaskPriority;
  categoryColor?: string;
  date: string;
  weekId: string;
  dayOfWeek?: string;
  createdAt: string;
}
