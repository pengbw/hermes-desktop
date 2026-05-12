import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HermesConfigData } from "@core/types";

export function useConfig() {
  const [config, setConfig] = useState<HermesConfigData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadConfig = useCallback(async () => {
    try {
      const result = await invoke<HermesConfigData>("get_config");
      setConfig(result);
    } catch (err) {
      console.error("Failed to load config:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const setConfigValue = useCallback(async (key: string, value: string) => {
    await invoke("set_config", { key, value });
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return {
    config,
    loading,
    loadConfig,
    setConfigValue,
  };
}
