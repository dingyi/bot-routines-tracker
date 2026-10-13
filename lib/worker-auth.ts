import { apiUrl } from "@/lib/preferences";

export type WorkerAuth = {
  mode: "worker";
  required: boolean;
  configured: boolean;
  unlocked: boolean;
};

export type GateState = "checking" | "open" | "client" | "worker" | "unconfigured";

export function parseWorkerAuth(value: unknown): WorkerAuth | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("mode" in value) || value.mode !== "worker") return null;
  if (!("required" in value) || typeof value.required !== "boolean") return null;
  if (!("unlocked" in value) || typeof value.unlocked !== "boolean") return null;
  const configured = "configured" in value && typeof value.configured === "boolean" ? value.configured : true;
  return { mode: "worker", required: value.required, configured, unlocked: value.unlocked };
}

let gateState: GateState = "checking";
let started = false;
let workerBacked = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function isWorkerBacked(): boolean {
  return workerBacked;
}

export function openGate(): void {
  gateState = "open";
  emit();
}

export function lockWorkerGate(): void {
  gateState = "worker";
  emit();
}

async function detectGate(clientPassword: string, clientUnlocked: boolean): Promise<GateState> {
  try {
    const response = await fetch(apiUrl("/api/auth"), { cache: "no-store", credentials: "same-origin" });
    const contentType = response.headers.get("content-type") ?? "";
    if (response.ok && contentType.includes("json")) {
      const parsed = parseWorkerAuth(await response.json());
      if (parsed) {
        workerBacked = true;
        if (!parsed.configured) return "unconfigured";
        if (!parsed.required || parsed.unlocked) return "open";
        return "worker";
      }
    }
  } catch {
    // A static host has no /api/auth route.
  }
  workerBacked = false;
  if (!clientPassword) return "open";
  return clientUnlocked ? "open" : "client";
}

function ensureGateCheck(clientPassword: string, clientUnlocked: boolean): void {
  if (started || typeof window === "undefined") return;
  started = true;
  void detectGate(clientPassword, clientUnlocked).then((next) => {
    gateState = next;
    emit();
  });
}

export function subscribeGate(clientPassword: string, clientUnlocked: boolean, listener: () => void): () => void {
  listeners.add(listener);
  ensureGateCheck(clientPassword, clientUnlocked);
  return () => {
    listeners.delete(listener);
  };
}

export function readGate(): GateState {
  return gateState;
}
