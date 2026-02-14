import styles from "@/components/ui/Badge.module.css";

export default function Badge({
  children,
  tone = "neutral",
  className = "",
  ...props
}) {
  const cls = [styles.badge, styles[tone] || styles.neutral, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} {...props}>
      {children}
    </span>
  );
}
