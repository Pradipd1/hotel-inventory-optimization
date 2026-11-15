import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart,
} from 'recharts';
import { CHART_COLORS } from '../../utils/constants.js';
import { formatCurrency, formatNumber, monthLabel } from '../../utils/format.js';

const axis = { fontSize: 11, fill: '#64748b' };
const grid = <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />;
const compact = (currency) => (v) => formatCurrency(v, currency, { compact: true });

function ChartBox({ height = 260, children }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}

export function MonthlyLineChart({ data, currency, color = CHART_COLORS[0], name = 'Value' }) {
  return (
    <ChartBox>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={compact(currency)} tick={axis} tickLine={false} axisLine={false} width={70} />
        <Tooltip formatter={(v) => formatCurrency(v, currency)} labelFormatter={monthLabel} />
        <Line type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ChartBox>
  );
}

export function MonthlyBarChart({ data, currency, color = CHART_COLORS[1], name = 'Value', xKey = 'month', series }) {
  const s = series || [{ key: 'value', label: name, color }];
  const isMonth = xKey === 'month';
  return (
    <ChartBox>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey={xKey} tickFormatter={isMonth ? monthLabel : undefined} tick={axis} tickLine={false} axisLine={false} interval={0} />
        <YAxis tickFormatter={compact(currency)} tick={axis} tickLine={false} axisLine={false} width={70} />
        <Tooltip formatter={(v) => formatCurrency(v, currency)} labelFormatter={isMonth ? monthLabel : undefined} cursor={{ fill: '#f1f5f9' }} />
        {s.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {s.map((x, i) => (
          <Bar key={x.key} dataKey={x.key} name={x.label} fill={x.color || CHART_COLORS[i + 1]} radius={[4, 4, 0, 0]} maxBarSize={44} />
        ))}
      </BarChart>
    </ChartBox>
  );
}

export function WastageAreaChart({ data, currency }) {
  return (
    <ChartBox>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="wastage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#dc2626" stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axis} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={compact(currency)} tick={axis} tickLine={false} axisLine={false} width={70} />
        <Tooltip formatter={(v) => formatCurrency(v, currency)} labelFormatter={monthLabel} />
        <Area type="monotone" dataKey="value" name="Wastage" stroke="#dc2626" strokeWidth={2} fill="url(#wastage)" />
      </AreaChart>
    </ChartBox>
  );
}

export function DonutChart({ data, nameKey = 'name', valueKey = 'value', currency, valueFormatter }) {
  const fmt = valueFormatter || ((v) => (currency ? formatCurrency(v, currency) : formatNumber(v)));
  const total = data.reduce((s, d) => s + (d[valueKey] || 0), 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-52 w-full max-w-[13rem]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="58%" outerRadius="95%" paddingAngle={1} stroke="none">
              {data.map((d, i) => <Cell key={i} fill={d.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => fmt(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid w-full min-w-0 grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {data.map((d, i) => (
          <li key={d[nameKey]} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color || CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="flex-1 truncate text-slate-600">{d[nameKey]}</span>
            <span className="font-medium text-slate-800 tabular-nums">{total ? `${((d[valueKey] / total) * 100).toFixed(0)}%` : '0%'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars: current stock vs reorder point per item. */
export function StockLevelChart({ data }) {
  return (
    <ChartBox height={Math.max(220, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={130} />
        <Tooltip formatter={(v, n, p) => `${formatNumber(v)} ${p.payload.unit}`} cursor={{ fill: '#f1f5f9' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="currentStock" name="Current stock" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} barSize={12} />
        <Bar dataKey="reorderPoint" name="Reorder point" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={12} />
      </BarChart>
    </ChartBox>
  );
}

export function TopConsumedChart({ data, currency }) {
  return (
    <ChartBox height={Math.max(200, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tickFormatter={compact(currency)} tick={axis} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={140} />
        <Tooltip formatter={(v, n, p) => [`${formatCurrency(v, currency)} (${formatNumber(p.payload.quantity)} ${p.payload.unit})`, 'Consumed']} cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ChartBox>
  );
}

/** Daily consumption bars with 7-day moving average and forecast line. */
export function ForecastChart({ history, projection, unit }) {
  const data = [
    ...history.map((h) => ({ date: h.date, quantity: h.quantity, movingAverage7: h.movingAverage7 })),
    ...projection.map((p) => ({ date: p.date, forecast: p.forecast })),
  ];
  return (
    <ChartBox height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(d) => d.slice(5)} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={44} />
        <Tooltip formatter={(v, n) => [`${formatNumber(v)} ${unit}`, n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="quantity" name="Daily consumption" fill="#cbd5e1" maxBarSize={10} />
        <Line type="monotone" dataKey="movingAverage7" name="7-day moving average" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} connectNulls />
        <Line type="stepAfter" dataKey="forecast" name="Forecast (avg/day)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" dot={false} />
      </ComposedChart>
    </ChartBox>
  );
}

export function SimplePie({ data, nameKey, valueKey, currency }) {
  return <DonutChart data={data} nameKey={nameKey} valueKey={valueKey} currency={currency} />;
}
