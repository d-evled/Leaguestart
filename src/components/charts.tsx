// Chart building blocks. Series colors are the dataviz reference palette's
// dark-theme categorical order, validated (lightness band, chroma floor, CVD
// separation, contrast) against this app's dark surface — assign by fixed
// index, never cycle or repaint on filter changes.
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const SERIES_COLORS = ["#3987e5", "#199e70", "#c98500", "#9085e9"];

const INK_DIM = "#8b95b3";
const GRID = "#2a3042";

const tooltipStyles = {
  contentStyle: {
    background: "#1d2230",
    border: `1px solid ${GRID}`,
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: INK_DIM },
  itemStyle: { color: "#d6dbe8" },
};

export interface SeriesDef {
  key: string;
  label: string;
}

interface MultiLineProps {
  data: Record<string, number | string | null>[];
  series: SeriesDef[];
  xKey: string;
  height?: number;
  stepped?: boolean;
  xTickFormatter?: (v: number) => string;
  yTickFormatter?: (v: number) => string;
  valueFormatter?: (v: number) => string;
  xLabel?: string;
  labelFormatter?: (v: number | string) => string;
}

/** Shared multi-series line chart (one y-axis, always). */
export function MultiLine({
  data,
  series,
  xKey,
  height = 260,
  stepped = false,
  xTickFormatter,
  yTickFormatter,
  valueFormatter,
  labelFormatter,
}: MultiLineProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey={xKey}
          stroke={INK_DIM}
          tick={{ fill: INK_DIM, fontSize: 11 }}
          tickLine={false}
          tickFormatter={xTickFormatter}
        />
        <YAxis
          stroke={INK_DIM}
          tick={{ fill: INK_DIM, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={yTickFormatter}
          width={52}
        />
        <Tooltip
          {...tooltipStyles}
          formatter={(value) =>
            valueFormatter && typeof value === "number"
              ? valueFormatter(value)
              : String(value ?? "—")
          }
          labelFormatter={labelFormatter}
        />
        {series.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 12, color: INK_DIM }} />
        )}
        {series.map((s, i) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            type={stepped ? "stepAfter" : "monotone"}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
