import { useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import styles from "@/pages/Support/Support.module.css";
import { useLang } from "@/i18n/LanguageContext";

export default function Support() {
  const { t } = useLang();
  const endpoint = import.meta.env.VITE_FORMSPREE_ENDPOINT;
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState({});

  const cooldownMs = 60 * 1000;
  const cooldownKey = "support_last_sent";
  const emailValue = email.trim().toLowerCase();
  const messageValue = message.trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
  const messageOk = messageValue.length >= 10 && messageValue.length <= 2000;
  const inCooldown = (() => {
    const last = Number(localStorage.getItem(cooldownKey) || 0);
    return Date.now() - last < cooldownMs;
  })();

  const onSubmit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!emailOk) nextErrors.email = true;
    if (!messageOk) nextErrors.message = true;
    if (!captcha) nextErrors.captcha = true;
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setStatus("invalid");
      return;
    }
    if (website) {
      setStatus("blocked");
      return;
    }
    if (inCooldown) {
      setStatus("cooldown");
      return;
    }
    if (!endpoint) {
      setStatus("missing");
      return;
    }
    if (!siteKey) {
      setStatus("missingKey");
      return;
    }

    setSending(true);
    setStatus("");
    setErrors({});
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: emailValue,
          message: messageValue,
          "g-recaptcha-response": captcha,
        }),
      });
      if (res.ok) {
        setStatus("sent");
        localStorage.setItem(cooldownKey, String(Date.now()));
        setEmail("");
        setMessage("");
        setCaptcha("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setSending(false);
    }
  };

  const statusText = {
    sent: t.support?.sent || "Message sent",
    error: t.support?.error || "Send failed",
    missing: t.support?.missing || "Form endpoint is not configured",
    missingKey: t.support?.missingKey || "reCAPTCHA site key is not configured",
    invalid: t.support?.invalid || "Please check the form fields",
    blocked: t.support?.blocked || "Spam protection triggered",
    cooldown: t.support?.cooldown || "Please wait a minute and try again",
  }[status];

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>{t.support?.title || "Support"}</h1>
      <p className={styles.text}>
        {t.support?.intro ||
          "If you need help or have questions, contact us:"}
      </p>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <label className={styles.label}>
          {t.support?.emailLabel || "Your email"}
        </label>
        <input
          className={styles.input}
          type="email"
          placeholder="you@example.com"
          value={emailValue}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {errors.email && (
          <div className={styles.errorText}>
            {t.support?.emailError || "Enter a valid email"}
          </div>
        )}

        <label className={styles.label}>
          {t.support?.messageLabel || "Message"}
        </label>
        <textarea
          className={styles.textarea}
          rows={6}
          value={messageValue}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
        {errors.message && (
          <div className={styles.errorText}>
            {t.support?.messageError || "Message is too short"}
          </div>
        )}

        <label className={styles.label}>
          {t.support?.recaptchaLabel || "Spam protection"}
        </label>
        {siteKey ? (
          <div className={styles.recaptchaBox}>
            <ReCAPTCHA
              sitekey={siteKey}
              onChange={setCaptcha}
              theme="dark"
            />
          </div>
        ) : (
          <div className={styles.errorText}>
            {t.support?.missingKey || "reCAPTCHA site key is not configured"}
          </div>
        )}
        {errors.captcha && (
          <div className={styles.errorText}>
            {t.support?.recaptchaError || "Please complete the captcha"}
          </div>
        )}

        <div className={styles.honeypot} aria-hidden="true">
          <label>
            Website
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </label>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.submit}
            disabled={
              sending ||
              inCooldown ||
              !emailOk ||
              !messageOk ||
              !captcha ||
              !siteKey
            }
          >
            {sending
              ? t.support?.sending || "Sending..."
              : t.support?.send || "Send"}
          </button>
          {statusText && (
            <span
              className={`${styles.status} ${
                status === "sent" ? styles.ok : styles.fail
              }`}
            >
              {statusText}
            </span>
          )}
        </div>
      </form>

      <p className={styles.direct}>
        {t.support?.discordHint || "Or contact directly via Discord"}
      </p>
      <div className={styles.contactBox}>
        <div className={styles.contactLabel}>
          {t.support?.discord || "Discord"}
        </div>
        <div className={styles.contactValue}>@entrils</div>
      </div>
    </div>
  );
}
