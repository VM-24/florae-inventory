// CSV for Excel/Numbers in PL/RU locales: ';' separator, UTF-8 BOM so Cyrillic opens correctly.
type Cell = string | number;

const escape = (v: Cell) => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(filename: string, rows: Cell[][]) {
  const text = '﻿' + rows.map(r => r.map(escape).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface SheetColumn<T> {
  title: string;
  value: (row: T) => Cell | null | undefined;
}

// Sheet laid out like the paper inventory form: values shared by every row (month, category)
// go once into a header block on top, then an empty line, then the table.
export function buildSheet<T>(opts: {
  title: string;
  meta: Array<[string, Cell]>;
  columns: SheetColumn<T>[];
  rows: T[];
}): Cell[][] {
  return [
    [opts.title],
    ...opts.meta.map(([label, value]) => [label, value]),
    [],
    opts.columns.map(c => c.title),
    ...opts.rows.map(r => opts.columns.map(c => c.value(r) ?? '')),
  ];
}

// The category goes into the header when the export holds exactly one category;
// with several it stays a column. Returns that single name, or null.
export function singleCategory<T>(rows: T[], name: (row: T) => string | null | undefined): string | null {
  const names = new Set(rows.map(r => name(r) ?? '—'));
  return names.size === 1 ? [...names][0] : null;
}
