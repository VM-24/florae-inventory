import { Button, DatePicker, Space } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { currentMonthKey, MONTH_FORMAT, monthKey, parseMonth } from '../month';

interface Props {
  value: string; // YYYY-MM
  onChange: (month: string) => void;
  monthsWithData?: Set<string>; // marked with a dot in the dropdown
  size?: 'small' | 'middle';
  width?: number;
}

// Inventory month: ← [month] →. Future months are disabled.
export default function MonthPicker({ value, onChange, monthsWithData, size = 'middle', width = 170 }: Props) {
  const shift = (delta: number) => onChange(monthKey(parseMonth(value).add(delta, 'month')));
  return (
    <Space.Compact>
      <Button size={size} icon={<LeftOutlined />} aria-label="Предыдущий месяц" onClick={() => shift(-1)} />
      <DatePicker
        size={size}
        picker="month"
        allowClear={false}
        value={parseMonth(value)}
        format={MONTH_FORMAT}
        onChange={d => d && onChange(monthKey(d))}
        disabledDate={d => d.isAfter(dayjs(), 'month')}
        cellRender={(current, info) => {
          if (info.type !== 'month' || !dayjs.isDayjs(current)) return info.originNode;
          return (
            <div style={{ position: 'relative' }}>
              {info.originNode}
              {monthsWithData?.has(monthKey(current)) && <span className="month-dot" />}
            </div>
          );
        }}
        style={{ width }}
      />
      <Button size={size} icon={<RightOutlined />} aria-label="Следующий месяц" disabled={value >= currentMonthKey()} onClick={() => shift(1)} />
    </Space.Compact>
  );
}
