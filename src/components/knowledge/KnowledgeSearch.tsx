import styles from "@pages/knowledge/KnowledgePanel.module.css";
import type { KnowledgeFile } from "@core/types";

interface KnowledgeSearchProps {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onSearch: () => void;
  searchResults: {
    source?: string;
    results?: KnowledgeFile[] | string;
  } | null;
  getFileIcon: (ext: string) => string;
  formatSize: (bytes: number) => string;
  t: (key: string) => string;
}

export default function KnowledgeSearch({
  searchQuery,
  onSearchQueryChange,
  onSearch,
  searchResults,
  getFileIcon,
  formatSize,
  t,
}: KnowledgeSearchProps) {
  return (
    <>
      <div className={styles.kbSearchBar}>
        <input
          type="text"
          className={styles.kbSearchInput}
          placeholder={t("kb.search")}
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
        />
        <button className={styles.kbSearchBtn} onClick={onSearch}>
          🔍
        </button>
      </div>

      {searchResults && (
        <div className={styles.kbSearchResults}>
          <h3>{t("kb.searchResult")}</h3>
          {searchResults.source === "local_fts" && Array.isArray(searchResults.results) ? (
            (searchResults.results as KnowledgeFile[]).length > 0 ? (
              <div className={styles.kbFileList}>
                {(searchResults.results as KnowledgeFile[]).map((file) => (
                  <div key={file.id} className={styles.kbFileItem}>
                    <span className={styles.kbFileIcon}>{getFileIcon(file.fileExt)}</span>
                    <span className={styles.kbFileName}>{file.fileName}</span>
                    <span className={styles.kbFilePath}>{file.filePath}</span>
                    <span className={styles.kbFileSize}>{formatSize(file.fileSize)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.kbNoResults}>{t("kb.noFiles")}</p>
            )
          ) : searchResults.source === "hermes_workspace" ? (
            <pre className={styles.kbRawResults}>{searchResults.results as string}</pre>
          ) : null}
        </div>
      )}
    </>
  );
}
