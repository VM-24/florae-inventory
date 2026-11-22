// Units of measure offered in the forms. Free text is allowed too (server: 1–20 chars).
// The list covers the units used in the LOUE stock sheets.
export const UNITS = ['шт', 'кг', 'л', 'м', 'уп.', 'порц', 'пуч.', 'пара', 'компл.', 'набор'];

export const UNIT_OPTIONS = UNITS.map(u => ({ value: u, label: u }));
