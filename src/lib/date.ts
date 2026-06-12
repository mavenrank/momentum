export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatFriendlyDate(dateKey: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(fromDateKey(dateKey));
}

export function startOfWeekKey(dateKey: string): string {
  const date = fromDateKey(dateKey);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toDateKey(date);
}

export function addDays(dateKey: string, days: number): string {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function getWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function startOfMonthKey(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function addMonths(dateKey: string, months: number): string {
  const date = fromDateKey(dateKey);
  return toDateKey(new Date(date.getFullYear(), date.getMonth() + months, 1));
}

export function formatMonth(dateKey: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(fromDateKey(dateKey));
}

export function getMonthCalendarDays(dateKey: string): string[] {
  const monthStart = fromDateKey(startOfMonthKey(dateKey));
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(monthStart.getDate() - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return toDateKey(date);
  });
}
