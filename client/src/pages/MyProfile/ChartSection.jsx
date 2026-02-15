import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useMemo } from "react";
import styles from "@/pages/MyProfile/MyProfile.module.css";

export default function ChartSection({
  matches,
  t,
  chartMetric,
  setChartMetric,
}) {
  const metricGroups = {
    all: ["score", "kills", "deaths", "damage", "damageShare", "kda"],
    score: ["score"],
    killsDeaths: ["kills", "deaths"],
    damage: ["damage"],
    damageShare: ["damageShare"],
    kda: ["kda"],
  };

  const chartData = useMemo(
    () =>
      matches.map((m) => ({
        ...m,
        kda: (Number(m.kills || 0) + Number(m.assists || 0)) / Math.max(1, Number(m.deaths || 0)),
      })),
    [matches]
  );

  const resultByIndex = useMemo(
    () => new Map(chartData.map((m) => [m.index, m.result])),
    [chartData]
  );

  const renderResultTick = ({ x, y, payload }) => {
    const result = resultByIndex.get(payload.value);
    const isWin = result === "victory";
    const isLoss = result === "defeat";
    const color = isWin ? "#35d07f" : isLoss ? "#ff5a72" : "rgba(160,170,195,0.7)";
    const label = isWin ? "W" : isLoss ? "L" : "-";

    return (
      <g transform={`translate(${x},${y})`}>
        <rect x={-7} y={-15} width={14} height={4} rx={2} fill={color} />
        <text
          x={0}
          y={0}
          dy={9}
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill={color}
        >
          {label}
        </text>
      </g>
    );
  };

  const renderTooltip = ({ active, payload }) => {
    if (!active || !Array.isArray(payload) || !payload.length) return null;
    const allowed = metricGroups[chartMetric] || metricGroups.all;
    const filtered = payload.filter((item) => allowed.includes(item?.dataKey));
    if (!filtered.length) return null;

    const labelMap = {
      score: t.me?.score || "Score",
      kills: t.me?.kills || "Kills",
      deaths: t.me?.deaths || "Deaths",
      damage: t.me?.damage || "Damage",
      damageShare: t.me?.damageShare || "Dmg share",
      kda: t.me?.kda || "KDA",
    };

    const formatValue = (name, value) => {
      if (name === "damageShare") return `${value}%`;
      if (name === "kda") return Number(value).toFixed(2);
      return value;
    };

    return (
      <div
        style={{
          background: "rgba(6, 10, 20, 0.95)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 10,
          color: "#f2f4ff",
          boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          padding: "8px 10px",
        }}
      >
        {filtered.map((item) => (
          <div key={item.dataKey} style={{ color: "#f2f4ff", fontSize: 12 }}>
            <span style={{ color: item?.stroke || item?.color }}>
              {formatValue(item.dataKey, item.value)}
            </span>{" "}
            {labelMap[item.dataKey] || item.dataKey}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`${styles.chartCard} ${styles.fadeIn}`}>
      <h2 className={styles.chartTitle}>{t.me?.progress || "Progress"}</h2>
      <div className={styles.chartControls}>
        <span className={styles.chartLabel}>
          {t.me?.chartSelect || "Show"}:
        </span>
        <div
          className={styles.chartToggle}
          role="tablist"
          aria-label="Chart metric"
        >
          <button
            className={`${styles.chartPill} ${
              chartMetric === "all" ? styles.chartPillActive : ""
            }`}
            onClick={() => setChartMetric("all")}
            role="tab"
            aria-selected={chartMetric === "all"}
          >
            {t.me?.chartAll || "All"}
          </button>
          <button
            className={`${styles.chartPill} ${
              chartMetric === "score" ? styles.chartPillActive : ""
            }`}
            onClick={() => setChartMetric("score")}
            role="tab"
            aria-selected={chartMetric === "score"}
          >
            {t.me?.score || "Score"}
          </button>
          <button
            className={`${styles.chartPill} ${
              chartMetric === "killsDeaths" ? styles.chartPillActive : ""
            }`}
            onClick={() => setChartMetric("killsDeaths")}
            role="tab"
            aria-selected={chartMetric === "killsDeaths"}
          >
            {(t.me?.kills || "Kills") + "/" + (t.me?.deaths || "Deaths")}
          </button>
          <button
            className={`${styles.chartPill} ${
              chartMetric === "damage" ? styles.chartPillActive : ""
            }`}
            onClick={() => setChartMetric("damage")}
            role="tab"
            aria-selected={chartMetric === "damage"}
          >
            {t.me?.damage || "Damage"}
          </button>
          <button
            className={`${styles.chartPill} ${
              chartMetric === "damageShare" ? styles.chartPillActive : ""
            }`}
            onClick={() => setChartMetric("damageShare")}
            role="tab"
            aria-selected={chartMetric === "damageShare"}
          >
            {t.me?.damageShare || "Dmg share"}
          </button>
          <button
            className={`${styles.chartPill} ${
              chartMetric === "kda" ? styles.chartPillActive : ""
            }`}
            onClick={() => setChartMetric("kda")}
            role="tab"
            aria-selected={chartMetric === "kda"}
          >
            {t.me?.kda || "KDA"}
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData}>
          <Line
            yAxisId="left"
            type="linear"
            dataKey="score"
            stroke="#00f5d4"
            strokeWidth={2}
            dot={false}
            strokeOpacity={chartMetric === "all" || chartMetric === "score" ? 1 : 0.15}
            className={chartMetric === "score" ? styles.chartLineActive : undefined}
          />
          <Line
            yAxisId="kills"
            type="linear"
            dataKey="kills"
            stroke="#a3ff12"
            strokeWidth={2}
            dot={false}
            strokeOpacity={chartMetric === "all" || chartMetric === "killsDeaths" ? 1 : 0.15}
            className={chartMetric === "killsDeaths" ? styles.chartLineActive : undefined}
          />
          <Line
            yAxisId="kills"
            type="linear"
            dataKey="deaths"
            stroke="#ff4d6d"
            strokeWidth={2}
            dot={false}
            strokeOpacity={chartMetric === "all" || chartMetric === "killsDeaths" ? 1 : 0.15}
            className={chartMetric === "killsDeaths" ? styles.chartLineActive : undefined}
          />
          <Line
            yAxisId="left"
            type="linear"
            dataKey="damage"
            stroke="#ff2d95"
            strokeWidth={2}
            dot={false}
            strokeOpacity={chartMetric === "all" || chartMetric === "damage" ? 1 : 0.15}
            className={chartMetric === "damage" ? styles.chartLineActive : undefined}
          />
          <Line
            yAxisId="right"
            type="linear"
            dataKey="damageShare"
            stroke="#ffb000"
            strokeWidth={2}
            dot={false}
            strokeOpacity={
              chartMetric === "all" || chartMetric === "damageShare" ? 1 : 0.15
            }
            className={
              chartMetric === "damageShare" ? styles.chartLineActive : undefined
            }
          />
          <Line
            yAxisId="kda"
            type="linear"
            dataKey="kda"
            stroke="#9b8cff"
            strokeWidth={2}
            dot={false}
            strokeOpacity={chartMetric === "all" || chartMetric === "kda" ? 1 : 0.15}
            className={chartMetric === "kda" ? styles.chartLineActive : undefined}
          />

          <CartesianGrid stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
          <XAxis
            dataKey="index"
            axisLine={false}
            tickLine={false}
            interval={0}
            height={34}
            tick={renderResultTick}
          />
          <YAxis yAxisId="left" />
          <YAxis
            yAxisId="kills"
            orientation="right"
            domain={["dataMin - 2", "dataMax + 2"]}
            hide
          />
          <YAxis yAxisId="right" orientation="right" domain={[0, 1]} ticks={[0, 1]} />
          <YAxis yAxisId="kda" orientation="right" hide domain={["dataMin - 0.2", "dataMax + 0.2"]} />
          <Tooltip content={renderTooltip} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
