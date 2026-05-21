import { useState, useRef } from "react";
import { useI18n } from "@contexts/I18nContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { Conversation } from "@core/types";

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
  const isComposingRef = useRef(false);
  const lastCompositionEndRef = useRef(0);
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
    const isActive = conv.id === currentConversationId;
    return (
      <div
        key={conv.id}
        className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-all duration-150 border-l-[3px] ${
          isActive
            ? "bg-primary/10 text-primary border-l-primary font-medium"
            : "border-l-transparent hover:bg-accent/50"
        } ${extraClass}`}
        onClick={() => !isRenaming && onSelectConversation(conv.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startRename(conv);
        }}
      >
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="flex-1 min-w-0 bg-background border border-primary rounded-md text-sm px-2 py-1 outline-none focus:ring-2 focus:ring-primary/20"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              lastCompositionEndRef.current = performance.now();
              queueMicrotask(() => {
                isComposingRef.current = false;
              });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const timeSinceComposition = performance.now() - lastCompositionEndRef.current;
                if (timeSinceComposition < 100) return;
                if (e.nativeEvent.isComposing || isComposingRef.current) {
                  isComposingRef.current = false;
                  return;
                }
                commitRename();
              }
              if (e.key === "Escape") setRenamingId(null);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="truncate flex-1 min-w-0">{conv.title}</span>
            <button
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive hover:bg-destructive/10 rounded p-0.5 transition-all"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteConversation(conv.id);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className={`flex flex-col shrink-0 overflow-hidden bg-card border-r transition-all duration-200 ${
        collapsed ? "w-11 min-w-11" : "w-[280px]"
      }`}
    >
      {!collapsed && (
        <div className="flex flex-col gap-2 p-2.5 pb-2 border-b">
          <Button variant="outline" size="sm" className="w-full justify-start gap-1.5 text-xs" onClick={onNewConversation}>
            <Plus className="h-3.5 w-3.5" />
            {t("chat.newChat")}
          </Button>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("chat.search")}
              value={convSearch}
              onChange={(e) => {
                setConvSearch(e.target.value);
                setConvPage(1);
              }}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-1.5 pb-2">
          {paginatedGroups.map((group) => (
            <div key={group.label} className="mb-1">
              <div className="text-[11px] font-semibold text-muted-foreground px-2.5 py-1.5 pb-0.5 tracking-wide uppercase">
                {t(group.label)}
              </div>
              {group.items.map((conv) => renderConvItem(conv))}
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto p-2 border-t flex items-center gap-1">
        {!collapsed && totalPages > 1 && (
          <div className="flex items-center gap-0.5 flex-wrap flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={convPage <= 1}
              onClick={() => setConvPage(1)}
            >
              <ChevronsLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={convPage <= 1}
              onClick={() => setConvPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Badge variant="secondary" className="h-5 text-[10px] px-1.5">
              {convPage}/{totalPages}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={convPage >= totalPages}
              onClick={() => setConvPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={convPage >= totalPages}
              onClick={() => setConvPage(totalPages)}
            >
              <ChevronsRight className="h-3 w-3" />
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onToggleCollapse}
          title={collapsed ? t("chat.expand") : t("chat.collapse")}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
