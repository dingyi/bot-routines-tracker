export type RoutineStatus = "enabled" | "paused";
export type TriggerType = "cron" | "webhook";

export type CronTrigger = {
  type: "cron";
  expression: string;
  timezone?: string;
};

export type WebhookTrigger = {
  type: "webhook";
  path?: string;
  description?: string;
};

export type Trigger = CronTrigger | WebhookTrigger;

export type Routine = {
  id: string;
  name: string;
  bot: string;
  status: RoutineStatus;
  summary: string;
  prompt: string;
  updatedAt: string | null;
  trigger: Trigger;
  /** Original trigger object, shown as JSON in the drawer. */
  triggerRaw: unknown;
};

export type RoutinesFile = {
  version: number;
  exportedAt: string | null;
  timezone: string;
  staleAfterMinutes: number;
  routines: Routine[];
};

export type ParseResult = {
  file: RoutinesFile;
  skipped: string[];
};
