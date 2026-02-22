import styles from "@/pages/UploadTab/UploadTab.module.css";

export default function UploadDropzoneCard({
  t,
  isDragging,
  setIsDragging,
  handlePaste,
  handleFiles,
  fileName,
  selectedFile,
  imageUrl,
  previewUrls,
  loading,
  onAnalyze,
  children,
}) {
  return (
    <div className={styles.card}>
      <input
        id="upload-file"
        data-cy="upload-input"
        type="file"
        accept="image/*"
        className={styles.fileInput}
        multiple
        onChange={(e) => handleFiles(Array.from(e.target.files || []))}
      />

      <label
        htmlFor="upload-file"
        className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaDrag : ""}`}
        tabIndex={0}
        onPaste={handlePaste}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const files = Array.from(e.dataTransfer.files || []);
          if (files.length) handleFiles(files);
        }}
      >
        <div className={styles.uploadIcon}>UP</div>
        <div className={styles.uploadText}>
          {t.upload.selectFile || "Choose screenshot"}
        </div>
        <div className={styles.uploadHint}>
          {(t.upload.selectHint || "PNG/JPG, preferably full screen") +
            " | " +
            (t.upload.pasteHint || "Paste: Ctrl+V")}
        </div>
        <div className={styles.uploadHintSecondary}>
          {t.upload.batchHint || "You can upload up to 10 screenshots at once"}
        </div>
        {fileName && <div className={styles.fileName}>{fileName}</div>}
      </label>

      <div
        className={`${styles.fileStatus} ${
          selectedFile ? styles.fileStatusReady : styles.fileStatusEmpty
        }`}
      >
        <span className={styles.fileStatusIcon}>{selectedFile ? "OK" : "!"}</span>
        <span className={styles.fileStatusText}>
          {selectedFile
            ? t.upload.fileReady || "File loaded - ready to analyze"
            : t.upload.fileMissing || "No file selected yet"}
        </span>
      </div>

      {imageUrl && <img src={imageUrl} alt="preview" className={styles.preview} />}
      {previewUrls.length > 1 && (
        <div className={styles.previewGrid}>
          {previewUrls.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              className={`${styles.previewThumb} ${
                idx === 0 ? styles.previewThumbActive : ""
              }`}
              title={`${t.upload.fileLabel || "File"} ${idx + 1}`}
            >
              <img src={url} alt={`preview-${idx + 1}`} />
            </div>
          ))}
        </div>
      )}

      <button
        data-cy="upload-analyze"
        onClick={onAnalyze}
        disabled={loading || !selectedFile}
        className={`${styles.button} ${selectedFile ? styles.buttonReady : ""}`}
      >
        {loading ? t.upload.processing : t.upload.analyze}
      </button>
      {previewUrls.length > 1 && (
        <p className={styles.batchNote}>
          {t.upload.batchNote ||
            "Batch upload is processed sequentially, so it may take longer."}
        </p>
      )}

      {children}
    </div>
  );
}
