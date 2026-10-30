import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format as formatDate } from "date-fns";
import type { Severity } from "@/lib/types";

const AXIS = "#7f96b0";
const GRID = "rgba(120,180,240,0.10)";

const tooltipStyle = {
  background: "#0b1929",
  border: "1px solid #1b334b",
  borderRadius: 12,
  fontSize: 11,
  color: "#e8f3ff",
  boxShadow: "0 20px 44px -28px rgba(0,0,0,0.95)",
} as const;

const severityColor: Record<Severity, string> = {
  CRITICAL: "#fb7185",
  WARNING: "#fbbf24",
  INFO: "#38bdf8",
};

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDate(date, "HH:mm");
}

export function TemperatureTrendChart({
  data,
  height = 260,
}: {
  data: Array<{ bucketStart: string; avg: number; min?: number; max?: number }>;
  height?: number;
}) {
  if (!data.length) {
    return <ChartEmpty height={height} message="No readings in the selected window." />;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="tempBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="bucketStart"
          tickFormatter={timeLabel}
          stroke={AXIS}
          tick={{ fill: AXIS, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          minTickGap={36}
        />
        <YAxis
          stroke={AXIS}
          tick={{ fill: AXIS, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v: number) => `${v}°`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(v) => timeLabel(String(v))}
          formatter={(value) => [`${Number(value).toFixed(2)} °C`, "Reading"]}
        />
        <Area type="monotone" dataKey="max" stroke="none" fill="url(#tempBand)" name="Max" />
        <Area type="monotone" dataKey="avg" stroke="#38bdf8" strokeWidth={2} fill="none" name="Average" dot={false} />
        <Line type="monotone" dataKey="min" stroke="#2dd4bf" strokeWidth={1} strokeDasharray="3 4" dot={false} name="Min" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ExcursionBarChart({
  data,
  height = 220,
}: {
  data: Array<{ day: string; total: number; critical: number }>;
  height?: number;
}) {
  if (!data.length) return <ChartEmpty height={height} message="No excursions recorded in this window." />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="day"
          stroke={AXIS}
          tick={{ fill: AXIS, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => formatDate(new Date(`${v}T00:00:00Z`), "d MMM")}
          minTickGap={20}
        />
        <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(v) => formatDate(new Date(`${v}T00:00:00Z`), "d MMM yyyy")}
        />
        <Bar dataKey="total" fill="#38bdf8" radius={[4, 4, 0, 0]} name="Excursions" />
        <Bar dataKey="critical" fill="#fb7185" radius={[4, 4, 0, 0]} name="Critical" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SeverityDonut({
  data,
  height = 200,
}: {
  data: Array<{ severity: Severity; count: number }>;
  height?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (!total) return <ChartEmpty height={height} message="No alerts raised recently." />;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="severity" innerRadius="62%" outerRadius="92%" paddingAngle={3} stroke="none">
              {data.map((entry) => (
                <Cell key={entry.severity} fill={severityColor[entry.severity]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} alerts`, "Count"]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="stat-value text-xl font-semibold text-ice">{total}</span>
          <span className="text-[10px] uppercase tracking-wider text-mist">Alerts</span>
        </div>
      </div>
      <ul className="space-y-2 text-xs">
        {data.map((entry) => (
          <li key={entry.severity} className="flex items-center gap-2 text-mist">
            <span className="size-2 rounded-full" style={{ background: severityColor[entry.severity] }} aria-hidden />
            <span className="capitalize">{entry.severity.toLowerCase()}</span>
            <span className="stat-value ml-auto font-semibold text-ice">{entry.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MiniSparkline({
  values,
  color = "#38bdf8",
  height = 42,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  if (values.length < 2) return <div style={{ height }} aria-hidden />;
  const data = values.map((value, index) => ({ index, value }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.75} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WarehouseBars({
  data,
  height = 240,
}: {
  data: Array<{ name: string; excursions: number; batches: number }>;
  height?: number;
}) {
  if (!data.length) return <ChartEmpty height={height} message="No warehouse activity yet." />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" stroke={AXIS} tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          stroke={AXIS}
          tick={{ fill: AXIS, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={120}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="batches" fill="#2dd4bf" radius={[0, 4, 4, 0]} name="Batches" />
        <Bar dataKey="excursions" fill="#fb7185" radius={[0, 4, 4, 0]} name="Excursions" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DeliveryChart({
  data,
  height = 240,
}: {
  data: Array<{ month: string; delivered: number; onTime: number; delayed: number }>;
  height?: number;
}) {
  if (!data.length) return <ChartEmpty height={height} message="No deliveries in the last six months." />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="month"
          stroke={AXIS}
          tick={{ fill: AXIS, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => formatDate(new Date(`${v}-01T00:00:00Z`), "MMM")}
        />
        <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(v) => formatDate(new Date(`${v}-01T00:00:00Z`), "MMMM yyyy")}
        />
        <Bar dataKey="onTime" stackId="d" fill="#2dd4bf" radius={[0, 0, 0, 0]} name="On time" />
        <Bar dataKey="delayed" stackId="d" fill="#fbbf24" radius={[4, 4, 0, 0]} name="Delayed" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChartEmpty({ height, message }: { height: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-dashed border-line/80 text-xs text-mist"
      style={{ height }}
    >
      {message}
    </div>
  );
}
