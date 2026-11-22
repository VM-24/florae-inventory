import type { ReactNode } from 'react';
import { Table, Card, Grid, Empty, Spin } from 'antd';
import type { TableProps } from 'antd';

const { useBreakpoint } = Grid;

// Как колонка ведёт себя в мобильной карточке:
//   header — заголовок карточки (крупно, без подписи; напр. имя/название);
//   inline — подпись слева, значение справа в одну строку (по умолчанию);
//   block  — подпись сверху, значение снизу во всю ширину (длинный текст, кнопки);
//   media  — картинка слева от заголовка (фото позиции), крупнее, чем в таблице;
//   hidden — не показывать на мобильном.
export type CardMode = 'header' | 'inline' | 'block' | 'media' | 'hidden';

// Колонка antd + необязательные подсказки для карточек. Лишние поля antd Table
// игнорирует, поэтому на десктопе тот же массив идёт в Table как есть.
export interface RColumn<T> {
  key?: string;
  title?: ReactNode;
  dataIndex?: string;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  ellipsis?: boolean;
  render?: (value: unknown, record: T, index: number) => ReactNode;
  card?: CardMode;
  cardLabel?: ReactNode; // подпись в карточке, если отличается от title
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ResponsiveTableProps<T> extends Omit<TableProps<T>, 'columns'> {
  columns: RColumn<T>[];
}

const MUTED = '#8a8290';

function keyOf<T>(record: T, index: number, rowKey: TableProps<T>['rowKey']): string {
  if (typeof rowKey === 'function') return String(rowKey(record, index));
  if (typeof rowKey === 'string') return String((record as Record<string, unknown>)[rowKey] ?? index);
  return String(index);
}

function cellValue<T>(col: RColumn<T>, record: T, index: number): ReactNode {
  const raw = col.dataIndex ? (record as Record<string, unknown>)[col.dataIndex] : undefined;
  return col.render ? col.render(raw, record, index) : (raw as ReactNode);
}

// Пустое значение колонки в карточке не рисуем (иначе висят пустые «Действия: »).
const isEmpty = (v: ReactNode): boolean => v == null || v === '' || v === false;

// Режим колонки по умолчанию: без заголовка (напр. столбец действий) — во всю
// ширину без подписи, иначе строка «подпись — значение».
const modeOf = <T,>(col: RColumn<T>): CardMode => col.card ?? (col.title ? 'inline' : 'block');

/**
 * Таблица на десктопе, карточки на мобильном (< lg, как и сайдбар в Layout).
 * Карточки строятся из тех же columns, поэтому desktop-поведение не меняется.
 * expandable.expandedRowRender, если задан, показывается внутри карточки.
 */
export default function ResponsiveTable<T>(props: ResponsiveTableProps<T>) {
  const screens = useBreakpoint();
  // Карточки только на телефонах (< md, 768px). Планшеты (md–lg) остаются таблицей —
  // там ширины хватает. До первого замера md === undefined → считаем десктопом, чтобы не мигало.
  const isMobile = screens.md === false;

  const { columns, dataSource, rowKey, onRow, loading, expandable, locale } = props;

  if (!isMobile) {
    return <Table<T> {...(props as TableProps<T>)} />;
  }

  const rows = (dataSource ?? []) as T[];

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  }
  if (rows.length === 0) {
    return <>{locale?.emptyText ?? <Empty />}</>;
  }

  const expandRender = expandable?.expandedRowRender;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((record, index) => {
        const rowProps = onRow?.(record, index) ?? {};
        const clickable = Boolean(rowProps.onClick);

        const headers: ReactNode[] = [];
        const media: ReactNode[] = [];
        const fields: Array<{ label: ReactNode; value: ReactNode; block: boolean }> = [];

        for (const col of columns) {
          const mode = modeOf(col);
          if (mode === 'hidden') continue;
          const value = cellValue(col, record, index);
          if (isEmpty(value)) continue;
          if (mode === 'header') {
            headers.push(value);
          } else if (mode === 'media') {
            media.push(value);
          } else {
            fields.push({ label: col.cardLabel ?? col.title, value, block: mode === 'block' });
          }
        }

        return (
          <Card
            key={keyOf(record, index, rowKey)}
            size="small"
            hoverable={clickable}
            onClick={rowProps.onClick}
            className={rowProps.className}
            style={{ ...(rowProps.style as React.CSSProperties), cursor: clickable ? 'pointer' : undefined }}
            styles={{ body: { padding: 12 } }}
          >
            {(headers.length > 0 || media.length > 0) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: fields.length ? 8 : 0 }}>
                {media.length > 0 && <div className="rt-card-media">{media}</div>}
                {headers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, fontSize: 15, fontWeight: 600, minWidth: 0 }}>
                    {headers.map((h, i) => <span key={i}>{h}</span>)}
                  </div>
                )}
              </div>
            )}

            {fields.map((f, i) => (
              f.block ? (
                <div key={i} style={{ padding: '7px 0', borderTop: i === 0 && headers.length === 0 ? undefined : '1px solid #f5f5f5' }}>
                  {!isEmpty(f.label) && <div style={{ fontSize: 12, color: MUTED, marginBottom: 3 }}>{f.label}</div>}
                  <div>{f.value}</div>
                </div>
              ) : (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '7px 0', borderTop: i === 0 && headers.length === 0 ? undefined : '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: 13, color: MUTED, flexShrink: 0 }}>{f.label}</span>
                  <span style={{ minWidth: 0, textAlign: 'right' }}>{f.value}</span>
                </div>
              )
            ))}

            {expandRender && (
              // Зеркалит раскрытие строки на десктопе: подробности спрятаны под disclosure.
              <details style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f5f5f5' }} onClick={e => e.stopPropagation()}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: MUTED }}>Подробнее</summary>
                <div style={{ marginTop: 8 }}>{expandRender(record, index, 0, true)}</div>
              </details>
            )}
          </Card>
        );
      })}
    </div>
  );
}
