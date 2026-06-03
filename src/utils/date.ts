import { format, startOfWeek, addDays, parseISO } from 'date-fns';

export function getWeekId(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

export function getTodayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function formatDate(date: Date | string, fmt: string = 'MMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt);
}

export function getWeekDays(weekId: string): Date[] {
  const monday = parseISO(weekId);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function getWeekRange(weekId: string): string {
  const monday = parseISO(weekId);
  const sunday = addDays(monday, 6);
  return `${format(monday, 'MMM d')} – ${format(sunday, 'MMM d, yyyy')}`;
}

export function getDayName(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'EEEE');
}

export function getShortDayName(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'EEE');
}

export function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];
  for (let d = firstDay; d <= lastDay; d = addDays(d, 1)) {
    days.push(new Date(d));
  }
  return days;
}
