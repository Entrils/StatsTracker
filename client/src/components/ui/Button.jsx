import styles from "@/components/ui/Button.module.css";

export default function Button({
  children,
  variant = "secondary",
  size = "md",
  iconOnly = false,
  className = "",
  type = "button",
  ...props
}) {
  const cls = [
    styles.button,
    styles[variant] || styles.secondary,
    styles[size] || styles.md,
    iconOnly ? styles.iconOnly : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={cls} {...props}>
      {children}
    </button>
  );
}

