/** Tiny client-side "something is running" signal. Wrap any slow request in
 * withProgress("Deleting batch…", () => fetch(...)) and the banner mounted in
 * the page shell shows a spinner, the message, and a running timer until it
 * finishes — success or failure — so a long action never looks frozen. */
export type BusyTask = { id: number; message: string; startedAt: number };

let tasks: BusyTask[] = [];
let nextId = 1;
const listeners = new Set<(t: BusyTask[]) => void>();
const emit = () => listeners.forEach((l) => l(tasks));

export function subscribeBusy(l: (t: BusyTask[]) => void): () => void {
  listeners.add(l);
  l(tasks);
  return () => { listeners.delete(l); };
}

export async function withProgress<T>(message: string, fn: () => Promise<T>): Promise<T> {
  const task: BusyTask = { id: nextId++, message, startedAt: Date.now() };
  tasks = [...tasks, task];
  emit();
  try {
    return await fn();
  } finally {
    tasks = tasks.filter((t) => t.id !== task.id);
    emit();
  }
}
