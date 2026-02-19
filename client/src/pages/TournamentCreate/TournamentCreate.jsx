import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./TournamentCreate.module.css";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/auth/AuthContext";
import Button from "@/components/ui/Button";
import StateMessage from "@/components/StateMessage/StateMessage";
import { TOURNAMENT_TEAM_FORMATS } from "@/shared/tournaments/teamUtils";
import { fileToOptimizedDataUrl } from "@/shared/tournaments/imageDataUrl";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const BRACKET_TYPES = ["single_elimination", "double_elimination", "group_playoff"];
const MAX_TEAMS_OPTIONS = [4, 8, 16, 32, 64];

export default function TournamentCreatePage() {
  const { t } = useLang();
  const { user, claims } = useAuth();
  const navigate = useNavigate();

  const tc = t?.tournaments?.create || {};
  const isAdmin = claims?.admin === true || claims?.role === "admin";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [prizePool, setPrizePool] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [teamFormat, setTeamFormat] = useState("5x5");
  const [bracketType, setBracketType] = useState("single_elimination");
  const [maxTeams, setMaxTeams] = useState(8);
  const [minElo, setMinElo] = useState(0);
  const [minMatches, setMinMatches] = useState(0);
  const [startsAt, setStartsAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");

  const onLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setLogoUrl("");
      return;
    }
    try {
      const dataUrl = await fileToOptimizedDataUrl(file, {
        maxLength: 1_400_000,
        maxSide: 1024,
        minSide: 256,
        tooLargeMessage: tc.logoTooLarge || "Logo is too large. Use a smaller image.",
      });
      setLogoUrl(dataUrl);
      setNotice("");
    } catch (err) {
      setNotice(err?.message || tc.logoUploadFailed || "Failed to upload logo");
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      setNotice(tc.loginRequired || "Login required");
      return;
    }
    if (!isAdmin) {
      setNotice(tc.adminOnly || "Admins only");
      return;
    }
    const titleSafe = String(title || "").trim();
    const startTs = startsAt ? Date.parse(startsAt) : NaN;
    if (!titleSafe || !Number.isFinite(startTs)) {
      setNotice(tc.createFailed || "Failed to create tournament");
      return;
    }

    setCreating(true);
    setNotice("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${BACKEND_URL}/tournaments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: titleSafe,
          description,
          rules,
          prizePool,
          logoUrl,
          teamFormat,
          bracketType,
          maxTeams: Number(maxTeams),
          requirements: {
            minElo: Number(minElo) || 0,
            minMatches: Number(minMatches) || 0,
          },
          startsAt: startTs,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || tc.createFailed || "Failed to create tournament");
      }
      navigate(data?.id ? `/tournaments/${data.id}` : "/tournaments");
    } catch (err) {
      setNotice(err?.message || tc.createFailed || "Failed to create tournament");
    } finally {
      setCreating(false);
    }
  };

  if (!user) {
    return (
      <div className={styles.wrapper}>
        <StateMessage text={tc.loginRequired || "Login required"} tone="error" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className={styles.wrapper}>
        <StateMessage text={tc.adminOnly || "Admins only"} tone="error" />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{tc.title || "Create tournament"}</h1>
          <p className={styles.subtitle}>{tc.subtitle || "Tournament settings"}</p>
        </div>
        <Link className={styles.detailsLink} to="/tournaments">
          {tc.back || "Back to tournaments"}
        </Link>
      </header>

      {notice ? <StateMessage text={notice} tone="error" /> : null}

      <form className={styles.createForm} onSubmit={onSubmit}>
        <h2 className={styles.formTitle}>{tc.newTournament || "New tournament"}</h2>

        <div className={styles.grid}>
          <label className={styles.label}>
            <span>{tc?.placeholders?.title || "Title"}</span>
            <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className={styles.label}>
            <span>{tc?.labels?.logo || "Logo"}</span>
            <input type="file" accept="image/*" className={styles.input} onChange={onLogoChange} />
          </label>
          <label className={styles.label}>
            <span>{tc?.labels?.format || "Format"}</span>
            <select className={styles.select} value={teamFormat} onChange={(e) => setTeamFormat(e.target.value)}>
              {TOURNAMENT_TEAM_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            <span>{tc?.labels?.bracketType || "Bracket type"}</span>
            <select className={styles.select} value={bracketType} onChange={(e) => setBracketType(e.target.value)}>
              {BRACKET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            <span>{tc?.labels?.maxTeams || "Max teams"}</span>
            <select className={styles.select} value={maxTeams} onChange={(e) => setMaxTeams(Number(e.target.value))}>
              {MAX_TEAMS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            <span>{tc?.labels?.minElo || "Min ELO"}</span>
            <input
              type="number"
              min="0"
              className={styles.input}
              value={minElo}
              onChange={(e) => setMinElo(Number(e.target.value || 0))}
            />
          </label>
          <label className={styles.label}>
            <span>{tc?.labels?.minMatches || "Min matches"}</span>
            <input
              type="number"
              min="0"
              className={styles.input}
              value={minMatches}
              onChange={(e) => setMinMatches(Number(e.target.value || 0))}
            />
          </label>
          <label className={styles.label}>
            <span>{tc?.labels?.start || "Start"}</span>
            <input
              type="datetime-local"
              className={styles.input}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
        </div>

        <label className={styles.label}>
          <span>{tc?.placeholders?.description || "Description"}</span>
          <textarea
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label className={styles.label}>
          <span>{tc?.placeholders?.rules || "Rules"}</span>
          <textarea className={styles.textarea} value={rules} onChange={(e) => setRules(e.target.value)} />
        </label>

        <label className={styles.label}>
          <span>{tc?.placeholders?.prizePool || "Prize pool"}</span>
          <input className={styles.input} value={prizePool} onChange={(e) => setPrizePool(e.target.value)} />
        </label>

        {logoUrl ? (
          <div className={styles.logoPreviewWrap}>
            <img src={logoUrl} alt="Tournament logo preview" className={styles.logoPreview} />
          </div>
        ) : null}

        <div className={styles.formActions}>
          <Button type="submit" size="sm" disabled={creating}>
            {creating ? tc.creating || "Creating..." : tc.create || "Create"}
          </Button>
        </div>
      </form>
    </div>
  );
}
