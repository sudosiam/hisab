import { format, parse, startOfMonth, endOfMonth } from 'date-fns';

export function getCurrentMonthKey(): string {
  return format(new Date(), 'yyyy-MM');
}

export function monthKeyToLabel(monthKey: string): string {
  const date = parse(monthKey, 'yyyy-MM', new Date());
  return format(date, 'MMMM yyyy');
}

export function getMonthRange(monthKey: string): { start: string; end: string } {
  const date = parse(monthKey, 'yyyy-MM', new Date());
  return {
    start: format(startOfMonth(date), 'yyyy-MM-dd'),
    end: format(endOfMonth(date), 'yyyy-MM-dd'),
  };
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function shiftMonth(monthKey: string, delta: number): string {
  const date = parse(monthKey, 'yyyy-MM', new Date());
  date.setMonth(date.getMonth() + delta);
  return format(date, 'yyyy-MM');
}
