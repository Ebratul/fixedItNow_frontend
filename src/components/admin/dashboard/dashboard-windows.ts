/**
 * The dashboard's period choices. A plain module (no "use client"): the page (server) parses `?days=` with it and
 * the period select (client) lists it. Values exported from a "use client" module reach the server only as client
 * references, not as values.
 */
export const DASHBOARD_WINDOWS = [7, 14, 30, 90] as const;
export const DEFAULT_DASHBOARD_DAYS = 30;

/** `?days=` as one of the offered windows; anything else means the default. */
export function dashboardWindowOf(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (DASHBOARD_WINDOWS as readonly number[]).includes(n) ? n : DEFAULT_DASHBOARD_DAYS;
}
