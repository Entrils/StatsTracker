import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import styles from "./MyProfile.module.css";

export default function ChartSection({
  matches,
  t,
  chartMetric,
  setChartMetric,
  chartToggleRef,
  chartPillRefs,
  pillStyle,
}) {
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
          ref={chartToggleRef}
        >
          <span
            className={styles.chartPillIndicator}
            style={{ left: pillStyle.left, width: pillStyle.width }}
          />
          <button
            ref={(el) => (chartPillRefs.current.all = el)}
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
            ref={(el) => (chartPillRefs.current.score = el)}
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
            ref={(el) => (chartPillRefs.current.kills = el)}
            className={`${styles.chartPill} ${
              chartMetric === "kills" ? styles.chartPillActive : ""
            }`}
            onClick={() => setChartMetric("kills")}
            role="tab"
            aria-selected={chartMetric === "kills"}
          >
            {t.me?.kills || "Kills"}
          </button>
          <button
            ref={(el) => (chartPillRefs.current.damage = el)}
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
            ref={(el) => (chartPillRefs.current.damageShare = el)}
            className={`${styles.chartPill} ${
              chartMetric === "damageShare" ? styles.chartPillActive : ""
            }`}
            onClick={() => setChartMetric("damageShare")}
            role="tab"
            aria-selected={chartMetric === "damageShare"}
          >
            {t.me?.damageShare || "Dmg share"}
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={matches}>
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
            strokeOpacity={chartMetric === "all" || chartMetric === "kills" ? 1 : 0.15}
            className={chartMetric === "kills" ? styles.chartLineActive : undefined}
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

          <CartesianGrid stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
          <XAxis dataKey="index" hide />
          <YAxis yAxisId="left" />
          <YAxis
            yAxisId="kills"
            orientation="right"
            domain={["dataMin - 2", "dataMax + 2"]}
            hide
          />
          <YAxis yAxisId="right" orientation="right" domain={[0, 1]} ticks={[0, 1]} />
          <Tooltip
            contentStyle={{
              background: "rgba(6, 10, 20, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 10,
              color: "#f2f4ff",
              boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
            }}
            labelStyle={{ color: "#9aa4c1" }}
            itemStyle={{ color: "#f2f4ff" }}
            formatter={(value, name, item) => {
              const labelMap = {
                score: t.me?.score || "Score",
                kills: t.me?.kills || "Kills",
                damage: t.me?.damage || "Damage",
                damageShare: t.me?.damageShare || "Dmg share",
              };
              const color = item?.stroke || item?.color;
              const label = name === "damageShare" ? `${value}%` : value;
              return [
                <span key={name} style={{ color }}>
                  {label}
                </span>,
                labelMap[name] || name,
              ];
            }}
            labelFormatter={() => ""}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
