import styles from "@/components/StateMessage/StateMessage.module.css";

export default function StateMessage({ text, tone = "neutral" }) {
  return (
    <div className={`${styles.box} ${styles[tone] || styles.neutral}`}>
      {text}
    </div>
  );
}

