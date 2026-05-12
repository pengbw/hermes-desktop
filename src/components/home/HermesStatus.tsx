import styles from "@pages/home/HomePanel.module.css";

interface HermesStatusProps {
  t: (key: string, params?: Record<string, string | number>) => string;
}

function HermesStatus({ t }: HermesStatusProps) {
  return (
    <div className={styles.homeAvatar}>
      <div className={styles.homeAvatarCircle}>
        <img src="/bot.svg" alt="小跃" className={styles.homeAvatarIcon} />
      </div>
      <h2>{t("home.welcome")}</h2>
      <p>{t("app.desc")}</p>
    </div>
  );
}

export default HermesStatus;
