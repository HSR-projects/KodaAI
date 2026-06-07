import { promises as fs } from "node:fs";
import path from "node:path";
import type { Thread } from "@/types";

const THREADS_DIR = path.join(process.cwd(), "data", "threads");

function filePath(userId: string) {
  return path.join(THREADS_DIR, `${userId}.json`);
}

export async function readThreads(userId: string): Promise<Thread[]> {
  try {
    const raw = await fs.readFile(filePath(userId), "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function writeThreads(userId: string, threads: Thread[]): Promise<void> {
  await fs.mkdir(THREADS_DIR, { recursive: true });
  await fs.writeFile(filePath(userId), JSON.stringify(threads, null, 2));
}

export async function upsertThread(userId: string, thread: Thread): Promise<void> {
  const threads = await readThreads(userId);
  const idx = threads.findIndex((t) => t.id === thread.id);
  if (idx >= 0) threads[idx] = thread;
  else threads.unshift(thread);
  await writeThreads(userId, threads);
}

export async function deleteThread(userId: string, threadId: string): Promise<void> {
  const threads = await readThreads(userId);
  await writeThreads(userId, threads.filter((t) => t.id !== threadId));
}
