import styles from "@/components/ui/SurfaceCard.module.css";

export default function SurfaceCard({ as = "div", className = "", children }) {
  const Tag = as;
  return <Tag className={`${styles.card} ${className}`.trim()}>{children}</Tag>;
}

