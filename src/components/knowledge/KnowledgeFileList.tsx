import styles from "@pages/knowledge/KnowledgePanel.module.css";
import type { KnowledgeFile } from "@core/types";

interface KnowledgeFileListProps {
  files: KnowledgeFile[];
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPreviewFile: (fileId: string, fileName: string) => void;
  getFileIcon: (ext: string) => string;
  formatSize: (bytes: number) => string;
  t: (key: string) => string;
}

export default function KnowledgeFileList({
  files,
  page,
  pageSize,
  onPageChange,
  onPreviewFile,
  getFileIcon,
  formatSize,
  t,
}: KnowledgeFileListProps) {
  if (files.length === 0) {
    return <p className={styles.kbNoFiles}>{t("kb.noFiles")}</p>;
  }

  const totalPages = Math.max(1, Math.ceil(files.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedFiles = files.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      <div className={styles.kbFileList}>
        <div className={styles.kbFileHeader}>
          <span className={styles.kbFileColIcon}></span>
          <span className={styles.kbFileColName}>{t("kb.fileName")}</span>
          <span className={styles.kbFileColPath}>{t("kb.filePath")}</span>
          <span className={styles.kbFileColSize}>{t("kb.fileSize")}</span>
          <span className={styles.kbFileColStatus}>{t("kb.fileStatus")}</span>
        </div>
        {pagedFiles.map((file) => (
          <div
            key={file.id}
            className={styles.kbFileItem + " " + styles.kbFileClickable}
            onClick={() => onPreviewFile(file.id, file.fileName)}
          >
            <span className={styles.kbFileColIcon}>{getFileIcon(file.fileExt)}</span>
            <span className={styles.kbFileColName}>{file.fileName}</span>
            <span className={styles.kbFileColPath}>{file.filePath}</span>
            <span className={styles.kbFileColSize}>{formatSize(file.fileSize)}</span>
            <span
              className={`${styles.kbFileColStatus} ${styles["kbFile" + file.indexStatus.charAt(0).toUpperCase() + file.indexStatus.slice(1)] || ""}`}
            >
              {file.indexStatus}
            </span>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className={styles.kbPagination}>
          <button
            className={styles.kbPageBtn}
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              className={`${styles.kbPageBtn} ${p === safePage ? styles.active : ""}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ))}
          <button
            className={styles.kbPageBtn}
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            ›
          </button>
          <span className={styles.kbPageInfo}>
            {files.length} {t("kb.total")}
          </span>
        </div>
      )}
    </>
  );
}
