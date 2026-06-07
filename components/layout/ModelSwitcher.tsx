"use client";

import { ChevronDown, Cpu, Loader2, Lock, Sparkles } from "lucide-react";
import { useModels } from "@/hooks/useModels";
import { useKodaStore } from "@/lib/store";
import { useAuth } from "@/components/auth/AuthProvider";
import { modelLabel } from "@/lib/utils";
import { AUTO_MODEL } from "@/lib/autoModel";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export function ModelSwitcher() {
  const { loading, error } = useModels();
  const { selectedModel, availableModels, setSelectedModel } = useKodaStore();
  const { caps } = useAuth();
  const setPricingOpen = useKodaStore((s) => s.setPricingOpen);

  // Free plan: locked to the auto-selected default model, no picker.
  if (!caps.allModels) {
    return (
      <button
        onClick={() => setPricingOpen(true)}
        title="Upgrade to Pro to choose any model"
        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-koda-border bg-koda-surface px-3 py-1.5 text-sm text-koda-muted transition-colors hover:bg-koda-surface-2"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Cpu className="h-4 w-4" />
        )}
        <span className="max-w-[120px] truncate">Auto</span>
        <Lock className="h-3 w-3" />
      </button>
    );
  }

  const isAuto = selectedModel === AUTO_MODEL;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Switch model"
          className="inline-flex items-center gap-2 rounded-lg border border-koda-border bg-koda-surface px-3 py-1.5 text-sm text-koda-text transition-colors hover:bg-koda-surface-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-koda-muted" />
          ) : isAuto ? (
            <Sparkles className="h-4 w-4 text-koda-accent" />
          ) : (
            <Cpu className="h-4 w-4 text-koda-accent" />
          )}
          <span className="max-w-[84px] truncate sm:max-w-[160px]">
            {selectedModel ? modelLabel(selectedModel) : "Select model"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-koda-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto">
        <DropdownMenuLabel>Smart selection</DropdownMenuLabel>
        <DropdownMenuItem
          selected={isAuto}
          onSelect={() => setSelectedModel(AUTO_MODEL)}
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-koda-accent" />
            <span className="flex flex-col">
              <span className="font-medium text-koda-text">Auto</span>
              <span className="text-xs text-koda-muted">
                Best model per task
              </span>
            </span>
          </span>
        </DropdownMenuItem>

        <DropdownMenuLabel>Koda AI models</DropdownMenuLabel>
        {error && (
          <p className="px-2.5 py-2 text-xs text-red-300">{error}</p>
        )}
        {!error && availableModels.length === 0 && !loading && (
          <p className="px-2.5 py-2 text-xs text-koda-muted">No models found.</p>
        )}
        {availableModels.map((m) => (
          <DropdownMenuItem
            key={m}
            selected={m === selectedModel}
            onSelect={() => setSelectedModel(m)}
          >
            {modelLabel(m)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
