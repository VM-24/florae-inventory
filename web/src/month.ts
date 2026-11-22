import dayjs, { type Dayjs } from 'dayjs';

// Counts are monthly. The API addresses a month as "YYYY-MM".
export const MONTH_FORMAT = 'MMMM YYYY';

export const monthKey = (d: Dayjs) => d.format('YYYY-MM');

export const currentMonthKey = () => monthKey(dayjs());

export const parseMonth = (key: string) => dayjs(`${key}-01`);

// "январь 2026"
export const formatMonth = (key: string | null | undefined) => (key ? parseMonth(key).format(MONTH_FORMAT) : '—');
