import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/pages/UploadTab/UploadTab.module.css";
import { useLang } from "@/i18n/LanguageContext";
import { useAuth } from "@/auth/AuthContext";
import useUploadAnalyzer from "@/hooks/upload/useUploadAnalyzer";
import PageState from "@/components/StateMessage/PageState";
import ToastStack from "@/components/upload/ToastStack";
import ManualResultModal from "@/components/upload/ManualResultModal";
import UploadDropzoneCard from "@/components/upload/UploadDropzoneCard";
import UploadResultsPanel from "@/components/upload/UploadResultsPanel";

export default function UploadTab() {
  const { t, lang } = useLang();
  const { user, claims } = useAuth();

  const [imageUrl, setImageUrl] = useState(null);
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("");
  const [lastMatch, setLastMatch] = useState(null);
  const [ocrRemaining, setOcrRemaining] = useState(null);
  const [loading, setLoading] = useState(false);
  const [batchResults, setBatchResults] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [manualResultRequest, setManualResultRequest] = useState(null);

  const tesseractRef = useRef(null);
  const tesseractInitRef = useRef(null);
  const manualResultResolverRef = useRef(null);
  const ensureTesseract = useCallback(async () => {
    if (tesseractRef.current) return tesseractRef.current;
    if (!tesseractInitRef.current) {
      tesseractInitRef.current = (async () => {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng+rus+fra+deu");
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789abcdef",
          preserve_interword_spaces: "1",
        });
        tesseractRef.current = worker;
        return worker;
      })();
    }
    return tesseractInitRef.current;
  }, []);

  const playUnlockSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const gain = ctx.createGain();
      gain.gain.value = 0.04;
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      const notes = [
        { freq: 440, dur: 0.08 },
        { freq: 554.37, dur: 0.08 },
        { freq: 659.25, dur: 0.08 },
        { freq: 880, dur: 0.14 },
      ];

      let t = now;
      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = note.freq;
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + note.dur);
        t += note.dur;
      });

      setTimeout(() => ctx.close(), 600);
    } catch {
      // ignore audio errors
    }
  }, []);

  const pushToast = useCallback(
    (message, tone = "good", icon = null) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, tone, icon }]);
      if (tone === "good") {
        playUnlockSound();
      }
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    [playUnlockSound]
  );

  const requestManualResult = useCallback(
    (fileLabel) =>
      new Promise((resolve) => {
        manualResultResolverRef.current = resolve;
        setManualResultRequest({ fileLabel });
      }),
    []
  );

  const resolveManualResult = useCallback((choice) => {
    const resolver = manualResultResolverRef.current;
    manualResultResolverRef.current = null;
    setManualResultRequest(null);
    if (resolver) resolver(choice || null);
  }, []);

  const handleFile = useCallback(
    (input) => {
      const files = Array.isArray(input)
        ? input.filter(Boolean)
        : input
        ? [input]
        : [];
      const limited = files.slice(0, 10);
      const primary = limited[0] || null;

      setSelectedFiles(limited);
      setSelectedFile(primary);
      setImageUrl(primary ? URL.createObjectURL(primary) : null);
      if (limited.length > 1) {
        const label =
          (t.upload?.filesSelected || "Selected files") + `: ${limited.length}`;
        setFileName(label);
      } else {
        setFileName(primary ? primary.name : "");
      }

      if (files.length > 10) {
        setStatus(
          t.upload?.batchLimit || "Only first 10 files will be processed"
        );
        setStatusTone("bad");
      }

      if (primary) {
        ensureTesseract().catch(() => {
          // handled on analyze
        });
      }
    },
    [ensureTesseract, t]
  );

    const handlePaste = useCallback(
    (event) => {
      const items = event.clipboardData?.items;
      if (!items?.length) return;
      const imageItem = Array.from(items).find((item) =>
        item.type.startsWith("image/")
      );
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      event.preventDefault();
      const ext = file.type.split("/")[1] || "png";
      const namedFile = file.name
        ? file
        : new File([file], `clipboard.${ext}`, { type: file.type });
      handleFile(namedFile);
      setStatus(t.upload.pasteReady || "Pasted from clipboard");
      setStatusTone("good");
    },
    [handleFile, t]
  );

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  useEffect(() => {
    const urls = (selectedFiles || []).map((file) =>
      file ? URL.createObjectURL(file) : null
    );
    setPreviewUrls(urls.filter(Boolean));
    return () => {
      urls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [selectedFiles]);

  useEffect(
    () => () => {
      if (manualResultResolverRef.current) {
        manualResultResolverRef.current(null);
        manualResultResolverRef.current = null;
      }
    },
    []
  );

  const handleAnalyze = useUploadAnalyzer({
    t,
    lang,
    user,
    claims,
    selectedFiles,
    selectedFile,
    ensureTesseract,
    requestManualResult,
    pushToast,
    setLoading,
    setStatus,
    setStatusTone,
    setOcrRemaining,
    setBatchResults,
    setSelectedFile,
    setImageUrl,
    setLastMatch,
  });

  if (!user) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>{t.upload.title}</h1>
        <PageState
          error={t.upload.loginRequired || "Login required"}
          errorText={t.upload.loginRequired || "Login required"}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <ToastStack toasts={toasts} />

      <div className={styles.titleRow}>
        <h1 className={styles.title}>{t.upload.title}</h1>
        <a href="/help" className={styles.helpIcon} title={t.upload?.helpLink}>
          ?
        </a>
      </div>

      <UploadDropzoneCard
        t={t}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
        handlePaste={handlePaste}
        handleFiles={handleFile}
        fileName={fileName}
        selectedFile={selectedFile}
        imageUrl={imageUrl}
        previewUrls={previewUrls}
        loading={loading}
        onAnalyze={handleAnalyze}
      >
        <UploadResultsPanel
          t={t}
          status={status}
          statusTone={statusTone}
          batchResults={batchResults}
          ocrRemaining={ocrRemaining}
          lastMatch={lastMatch}
        />
      </UploadDropzoneCard>

      <ManualResultModal
        t={t}
        request={manualResultRequest}
        onVictory={() => resolveManualResult("victory")}
        onDefeat={() => resolveManualResult("defeat")}
        onSkip={() => resolveManualResult(null)}
      />
    </div>
  );
}

