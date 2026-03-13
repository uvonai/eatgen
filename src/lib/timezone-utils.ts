/**
 * TIMEZONE-AWARE DATE UTILITIES
 * Ensures consistent date handling across all timezones globally
 * All functions use the user's local timezone automatically
 */

/**
 * Get today's date string in user's local timezone (YYYY-MM-DD format)
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date key for localStorage caching (human readable)
 */
export function getLocalDateKey(date: Date = new Date()): string {
  return date.toDateString(); // e.g., "Sat Feb 01 2026"
}

/**
 * Get the start of day in user's local timezone
 */
export function getLocalDayStart(date: Date = new Date()): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Get the end of day in user's local timezone
 */
export function getLocalDayEnd(date: Date = new Date()): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Get user's timezone offset in minutes (for backend queries)
 */
export function getTimezoneOffset(): number {
  return new Date().getTimezoneOffset();
}

/**
 * Get user's timezone name (e.g., "Asia/Kolkata")
 */
export function getTimezoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Check if two dates are the same day in local timezone
 */
export function isSameLocalDay(date1: Date, date2: Date): boolean {
  return date1.toDateString() === date2.toDateString();
}

/**
 * Check if the given date is today in user's local timezone
 */
export function isToday(date: Date): boolean {
  return isSameLocalDay(date, new Date());
}

/**
 * Calculate milliseconds until midnight in user's local timezone
 */
export function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

/**
 * Generate week dates starting from Monday, in user's local timezone
 */
export function getWeekDates(): Array<{
  dayName: string;
  date: number;
  fullDate: Date;
  isToday: boolean;
}> {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  // Adjust to Monday (handle Sunday = 0)
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeek.setDate(today.getDate() + mondayOffset);
  
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    days.push({
      dayName: dayNames[i],
      date: date.getDate(),
      fullDate: date,
      isToday: isSameLocalDay(date, today),
    });
  }
  
  return days;
}
