import styles from "@/pages/TournamentsPage/Tournaments.module.css";

export default function TournamentTabs({ tabs = [], currentTab = "", onChange }) {
  return (
    <div className={styles.tabs}>
      {tabs.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`${styles.tab} ${currentTab === item.key ? styles.tabActive : ""}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

