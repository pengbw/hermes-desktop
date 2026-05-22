import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

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

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProviders = useCallback(async () => {
    try {
      const result = await invoke<Provider[]>("list_providers");
      setProviders(result);
    } catch {
      // console.error("Failed to load providers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createProvider = useCallback(
    async (req: { name: string; value: string; baseUrl: string; apiKey: string }) => {
      await invoke("create_provider", { req });
      await loadProviders();
    },
    [loadProviders]
  );

  const updateProvider = useCallback(
    async (id: string, req: { name: string; value: string; baseUrl: string; apiKey: string }) => {
      await invoke("update_provider", { id, ...req });
      await loadProviders();
    },
    [loadProviders]
  );

  const deleteProvider = useCallback(
    async (id: string) => {
      await invoke("delete_provider", { id });
      await loadProviders();
    },
    [loadProviders]
  );

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  return {
    providers,
    loading,
    loadProviders,
    createProvider,
    updateProvider,
    deleteProvider,
  };
}
