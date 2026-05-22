import { Search, Edit, Trash, CirclePlus } from "lucide-react";
import ProviderIcon from "./ProviderIcon";

interface Provider {
  id: string;
  name: string;
  value: string;
  baseUrl: string;
  apiKeyEnv: string;
  apiKey: string;
  icon: string;
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface ProviderSettingsProps {
  providers: Provider[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onAdd: () => void;
  onEdit: (p: Provider) => void;
  onDelete: (id: string) => void;
  t: (key: string) => string;
}

export default function ProviderSettings({
  providers,
  searchQuery,
  onSearchChange,
  page,
  pageSize,
  onPageChange,
  onAdd,
  onEdit,
  onDelete,
  t,
}: ProviderSettingsProps) {
  const filtered = providers.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.value.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1.5 duration-200">
      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              className="w-full pl-8 pr-8 py-1.5 border border-input rounded-lg bg-background text-sm text-foreground outline-none focus:border-primary transition-colors"
              placeholder={t("provider.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                onPageChange(1);
              }}
            />
            {searchQuery && (
              <button
                className="absolute right-2 bg-none border-0 text-xs text-muted-foreground cursor-pointer p-0.5 rounded hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => {
                  onSearchChange("");
                  onPageChange(1);
                }}
              >
                ✕
              </button>
            )}
          </div>
          <button
            className="px-3.5 py-1.5 border border-primary rounded-md bg-transparent text-primary text-xs cursor-pointer transition-all hover:bg-primary/5 whitespace-nowrap flex items-center gap-1"
            onClick={onAdd}
          >
            <CirclePlus className="h-3.5 w-3.5" />
            {t("provider.add")}
          </button>
        </div>
        {providers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <span className="text-4xl mb-2 opacity-60">🔌</span>
            <p className="text-sm m-0">{t("provider.empty")}</p>
          </div>
        )}
        {providers.length > 0 && (
          <>
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <span className="text-4xl mb-2 opacity-60">🔍</span>
                <p className="text-sm m-0">{t("provider.noSearchResult")}</p>
              </div>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
              {paged.map((p, index) => (
                <div
                  key={p.id}
                  className="flex flex-col bg-card rounded-xl border border-border transition-all hover:border-primary hover:shadow-lg hover:-translate-y-0.5 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex flex-col items-center px-2.5 pt-2.5 pb-1.5 bg-gradient-to-br from-primary/5 to-primary/[0.02] border-b border-border relative">
                    <span
                      className={`absolute top-1.5 right-1.5 text-[9px] px-1 py-px rounded font-medium whitespace-nowrap leading-tight ${
                        p.isBuiltin
                          ? "bg-primary/10 text-primary"
                          : "bg-purple-500/10 text-purple-500"
                      }`}
                    >
                      {p.isBuiltin ? t("provider.builtin") : t("provider.custom")}
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-lg mb-1 shadow-sm">
                      <ProviderIcon providerName={p.name} icon={p.icon} size={36} />
                    </div>
                    <div className="text-[13px] font-bold text-foreground text-center mb-0.5 flex items-center justify-center gap-1">
                      {p.name}
                      <span
                        className={`text-xs leading-none ${p.apiKey ? "opacity-80" : "opacity-90"}`}
                      >
                        {p.apiKey ? "🔑" : "⚠️"}
                      </span>
                    </div>
                  </div>
                  <div className="px-2.5 py-1.5 flex-1">
                    <div className="flex items-baseline gap-1.5 mb-0.5">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                        ID
                      </span>
                      <span className="text-[11px] text-muted-foreground font-mono truncate">
                        {p.value}
                      </span>
                    </div>
                    {p.baseUrl && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                          URL
                        </span>
                        <span
                          className="text-[11px] text-muted-foreground font-mono truncate max-w-full"
                          title={p.baseUrl}
                        >
                          {p.baseUrl}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 px-2.5 py-1.5 border-t border-border">
                    <button
                      className="inline-flex items-center justify-center gap-1 flex-1 px-1.5 py-1 border border-input bg-background rounded-md text-[11px] cursor-pointer text-muted-foreground transition-all hover:border-primary hover:text-primary hover:bg-primary/5"
                      onClick={() => onEdit(p)}
                      title={t("provider.edit")}
                    >
                      <Edit className="h-3 w-3" />
                      {t("provider.edit")}
                    </button>
                    {!p.isBuiltin && (
                      <button
                        className="inline-flex items-center justify-center gap-1 flex-1 px-1.5 py-1 border border-input bg-background rounded-md text-[11px] cursor-pointer text-muted-foreground transition-all hover:border-red-500 hover:text-red-500 hover:bg-red-500/5"
                        onClick={() => onDelete(p.id)}
                        title={t("provider.delete")}
                      >
                        <Trash className="h-3 w-3" />
                        {t("provider.delete")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-4 pt-3 border-t border-border">
                <button
                  className="min-w-[28px] h-7 inline-flex items-center justify-center border border-input bg-background rounded-md text-xs cursor-pointer text-muted-foreground transition-all px-1.5 hover:border-primary hover:text-primary hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={safePage <= 1}
                  onClick={() => onPageChange(safePage - 1)}
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    className={`min-w-[28px] h-7 inline-flex items-center justify-center border rounded-md text-xs cursor-pointer transition-all px-1.5 ${
                      p === safePage
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5"
                    }`}
                    onClick={() => onPageChange(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  className="min-w-[28px] h-7 inline-flex items-center justify-center border border-input bg-background rounded-md text-xs cursor-pointer text-muted-foreground transition-all px-1.5 hover:border-primary hover:text-primary hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={safePage >= totalPages}
                  onClick={() => onPageChange(safePage + 1)}
                >
                  ›
                </button>
                <span className="text-xs text-muted-foreground ml-2">
                  {filtered.length} {t("provider.total")}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export type { Provider };
