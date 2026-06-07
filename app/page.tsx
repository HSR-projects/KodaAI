"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { Attachment } from "@/types";
import { useKodaStore } from "@/lib/store";
import { useModels } from "@/hooks/useModels";
import { useAuth } from "@/components/auth/AuthProvider";
import { Header } from "@/components/layout/Header";
import { SearchBar } from "@/components/search/SearchBar";
import { SuggestedQueries } from "@/components/search/SuggestedQueries";

export default function HomePage() {
  const router = useRouter();
  useModels();
  const { caps } = useAuth();
  const {
    focusMode,
    setFocusMode,
    createThread,
    agentMode,
    setAgentMode,
    swarmMode,
    setSwarmMode,
    targetUrl,
    setTargetUrl,
    setPricingOpen,
  } = useKodaStore();

  const onAgentToggle = () => {
    if (!caps.agent) { setPricingOpen(true); return; }
    setAgentMode(!agentMode);
    if (!agentMode) setSwarmMode(false); // agent and swarm are mutually exclusive
  };

  const onSwarmToggle = () => {
    if (!caps.swarm) { setPricingOpen(true); return; }
    setSwarmMode(!swarmMode);
    if (!swarmMode) setAgentMode(false);
  };

  const start = (query: string, attachments?: Attachment[]) => {
    const id = createThread(query || "Attachment");
    const thread = useKodaStore.getState().getThread(id);
    if (thread) {
      fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread }),
      }).catch(() => {});
    }
    // Hand attachments off to the thread page, which sends them with the query.
    if (attachments?.length) {
      useKodaStore.getState().setPendingAttachments(attachments);
    }
    router.push(`/search/${id}?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="koda-hero-glow flex flex-1 flex-col items-center justify-center px-4">
        <div className="w-full max-w-2xl pb-24">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.1 } },
            }}
            className="mb-8 text-center"
          >
            <motion.h1
              variants={fadeUp}
              className="text-balance text-4xl font-semibold tracking-tight text-koda-text sm:text-5xl"
            >
              Ask anything,{" "}
              <span className="bg-gradient-to-r from-koda-accent-soft to-koda-accent bg-clip-text text-transparent">
                privately
              </span>
              .
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-3 text-koda-muted">
              Search-augmented AI by Koda AI — your queries never
              touch OpenAI or Anthropic.
            </motion.p>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" animate="show">
            <SearchBar
              focusMode={focusMode}
              onFocusChange={setFocusMode}
              onSubmit={start}
              autoFocus
              showAgent
              agentMode={agentMode}
              agentLocked={!caps.agent}
              onAgentToggle={onAgentToggle}
              showSwarm
              swarmMode={swarmMode}
              swarmLocked={!caps.swarm}
              onSwarmToggle={onSwarmToggle}
              targetUrl={targetUrl}
              onTargetUrlChange={setTargetUrl}
            />
          </motion.div>

          <div className="mt-8">
            <SuggestedQueries onSelect={start} />
          </div>
        </div>
      </main>
    </div>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};
