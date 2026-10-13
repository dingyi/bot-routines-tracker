export const MAX_FEED_BYTES: number;

export class FeedError extends Error {
  readonly status: number;
  constructor(message: string, status?: number);
}

export function readPrivateUrl(url: string, token: string, fetchImpl?: typeof fetch): Promise<string>;
export function publicMessage(error: unknown): string;
