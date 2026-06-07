"use client";

import { useEffect, useState } from "react";
import { useKodaStore } from "@/lib/store";
import { AUTO_MODEL } from "@/lib/autoModel";

interface ModelsResponse {
  models: string[];
  default?: string;
  error?: string;
}

// Cache the network call at module scope so React Strict Mode's double-mount
// (and multiple components using the hook) share one request.
let modelsPromise: Promise<ModelsResponse> | null = null;

function fetchModels(): Promise<ModelsResponse> {
  if (!modelsPromise) {
    modelsPromise = fetch("/api/ollama/models")
      .then((r) => r.json())
      .catch((): ModelsResponse => ({
        models: [],
        error: "Could not reach Ollama Cloud.",
      }));
  }
  return modelsPromise;
}

/** Fetches the list of Ollama Cloud models and hydrates the store. */
export function useModels() {
  const setAvailableModels = useKodaStore((s) => s.setAvailableModels);
  const setSelectedModel = useKodaStore((s) => s.setSelectedModel);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetchModels().then((data) => {
      // Store updates are global/idempotent — always apply them, even if this
      // particular effect instance was cleaned up by Strict Mode.
      const models = data.models ?? [];
      setAvailableModels(models);

      const current = useKodaStore.getState().selectedModel;
      // "Auto" is a valid selection even though it isn't a real model id.
      if (current !== AUTO_MODEL && (!current || !models.includes(current))) {
        const pick =
          (data.default && models.includes(data.default) && data.default) ||
          models[0] ||
          data.default ||
          current ||
          "";
        if (pick) setSelectedModel(pick);
      }

      if (active) {
        setError(data.error ?? (models.length ? null : "No models found."));
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [setAvailableModels, setSelectedModel]);

  return { loading, error };
}
