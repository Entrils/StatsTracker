import styles from "@/pages/MyProfile/MyProfile.module.css";

function safeDiv(a, b) {
  return b === 0 ? 0 : a / b;
}

function Sparkline({ data }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(1, max - min);
  const step = data.length > 1 ? 100 / (data.length - 1) : 0;
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = 24 - Math.round(((v - min) / range) * 20);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

export default function Stat({
  label,
  value,
  icon,
  accent,
  variant,
  trend,
  bar,
  rank,
  rankLabel,
}) {
  const variantClass =
    variant === "hero"
      ? styles.statHero
      : variant === "compact"
      ? styles.statCompact
      : "";
  const rankScore =
    typeof rank === "number" ? Math.max(1, 100 - Math.min(100, rank) + 1) : null;
  const barWidth = bar
    ? `${Math.min(
        100,
        rankScore ?? safeDiv(bar.value * 100, bar.max || 1)
      )}%`
    : null;
  return (
    <div
      className={`${styles.statCard} ${variantClass} ${
        accent === "win"
          ? styles.statWin
          : accent === "loss"
          ? styles.statLoss
          : accent === "rate"
          ? styles.statRate
          : ""
      }`}
    >
      {icon ? <div className={styles.statIcon}>{icon}</div> : null}
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {rank ? (
        <div className={styles.statMeta}>
          {rankLabel || "Top"} {rank}%
        </div>
      ) : null}
      {bar ? (
        <div className={styles.statBar}>
          <span className={styles.statBarFill} style={{ width: barWidth }} />
        </div>
      ) : null}
      {variant === "hero" && Array.isArray(trend) && trend.length ? (
        <div className={styles.statSpark}>
          <Sparkline data={trend} />
        </div>
      ) : null}
    </div>
  );
}
