// Single currency for the whole app: Polish złoty.
export const CURRENCY = 'PLN';

const formatter = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: CURRENCY });

export const formatMoney = (amount: number) => formatter.format(amount);

// Sum in grosze to avoid float drift when totalling many rows.
export const sumMoney = (values: number[]) =>
  values.reduce((acc, v) => acc + Math.round(v * 100), 0) / 100;
