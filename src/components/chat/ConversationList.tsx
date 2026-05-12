import { useState, useRef } from "react";
import { useI18n } from "@contexts/I18nContext";
import type { Conversation } from "@core/types";
import styles from "./ConversationList.module.css";

interface ConversationListProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function ConversationList({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  collapsed,
  onToggleCollapse,
}: ConversationListProps) {
  const { t } = useI18n();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [convSearch, setConvSearch] = useState("");
  const [convPage, setConvPage] = useState(1);
  const PAGE_SIZE = 10;

  const startRename = (conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameConversation(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const groupConversations = (convs: Conversation[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const groups: { label: string; items: Conversation[] }[] = [];
    const todayItems: Conversation[] = [];
    const yesterdayItems: Conversation[] = [];
    const weekItems: Conversation[] = [];
    const earlierItems: Conversation[] = [];
    convs.forEach((c) => {
      const d = new Date(c.createdAt);
      if (d >= today) todayItems.push(c);
      else if (d >= yesterday) yesterdayItems.push(c);
      else if (d >= weekAgo) weekItems.push(c);
      else earlierItems.push(c);
    });
    if (todayItems.length) groups.push({ label: "chat.today", items: todayItems });
    if (yesterdayItems.length) groups.push({ label: "chat.yesterday", items: yesterdayItems });
    if (weekItems.length) groups.push({ label: "chat.thisWeek", items: weekItems });
    if (earlierItems.length) groups.push({ label: "chat.earlier", items: earlierItems });
    return groups;
  };

  const filteredConvs = conversations
    .filter((c) => (convSearch ? c.title.toLowerCase().includes(convSearch.toLowerCase()) : true))
    .sort((a, b) => b.createdAt - a.createdAt);
  const totalFiltered = filteredConvs.length;
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);
  const paginatedConvs = filteredConvs.slice((convPage - 1) * PAGE_SIZE, convPage * PAGE_SIZE);
  const paginatedGroups = groupConversations(paginatedConvs);

  const renderConvItem = (conv: Conversation, extraClass: string = "") => {
    const isRenaming = renamingId === conv.id;
    return (
      <div
        key={conv.id}
        className={`${styles.conversationItem} ${extraClass} ${conv.id === currentConversationId ? styles.conversationItemActive : ""}`}
        onClick={() => !isRenaming && onSelectConversation(conv.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startRename(conv);
        }}
      >
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className={styles.convRenameInput}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenamingId(null);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={styles.convIcon}>💬</span>
        )}
        {isRenaming ? null : <span className={styles.convTitle}>{conv.title}</span>}
        <button
          className={styles.convDelete}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteConversation(conv.id);
          }}
        >
          ×
        </button>
      </div>
    );
  };

  return (
    <div className={`${styles.chatSidebar} ${collapsed ? styles.chatSidebarCollapsed : ""}`}>
      <div className={styles.chatSidebarHeader}>
        {!collapsed && (
          <>
            <button className={styles.newChatBtn} onClick={onNewConversation}>
              {t("chat.newChat")}
            </button>
            <div className={styles.chatSearchBox}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className={styles.chatSearchInput}
                type="text"
                placeholder={t("chat.search")}
                value={convSearch}
                onChange={(e) => {
                  setConvSearch(e.target.value);
                  setConvPage(1);
                }}
              />
            </div>
          </>
        )}
      </div>
      {!collapsed && (
        <div className={styles.conversationList}>
          {paginatedGroups.map((group) => (
            <div key={group.label} className={styles.convGroup}>
              <div className={styles.convGroupLabel}>{t(group.label)}</div>
              {group.items.map((conv) => renderConvItem(conv))}
            </div>
          ))}
        </div>
      )}
      <div className={styles.chatSidebarFooter}>
        {!collapsed && (
          <div className={styles.convPagination}>
            <button
              className={styles.pageNavBtn}
              disabled={convPage <= 1}
              onClick={() => setConvPage(1)}
            >
              {t("chat.firstPage")}
            </button>
            <button
              className={styles.pageNavBtn}
              disabled={convPage <= 1}
              onClick={() => setConvPage((p) => Math.max(1, p - 1))}
            >
              {t("chat.prevPage")}
            </button>
            <button
              className={styles.pageNavBtn}
              disabled={convPage >= totalPages}
              onClick={() => setConvPage((p) => Math.min(totalPages, p + 1))}
            >
              {t("chat.nextPage")}
            </button>
            <button
              className={styles.pageNavBtn}
              disabled={convPage >= totalPages}
              onClick={() => setConvPage(totalPages)}
            >
              {t("chat.lastPage")}
            </button>
          </div>
        )}
        <button
          className={styles.sidebarToggleBtn}
          onClick={onToggleCollapse}
          title={collapsed ? t("chat.expand") : t("chat.collapse")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {collapsed ? (
              <polyline points="9 18 15 12 9 6" />
            ) : (
              <polyline points="15 18 9 12 15 6" />
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
