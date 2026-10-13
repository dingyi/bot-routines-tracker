import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

const SESSION_LABEL = "bot-routines-session-v1";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

function bytesEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  // Workers expose this on SubtleCrypto. Node's Web Crypto build in this
  // toolchain does not, so tests use the Node helper on the same fixed-size hashes.
  const compare = crypto.subtle.timingSafeEqual;
  if (typeof compare === "function") return compare.call(crypto.subtle, left, right);
  return nodeTimingSafeEqual(Buffer.from(left), Buffer.from(right));
}

/** Compare two strings without leaking which one matched, including their lengths. */
export async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(provided), digest(expected)]);
  return bytesEqual(left, right);
}

export async function passwordMatches(provided: string, expected: string): Promise<boolean> {
  return tokensMatch(provided, expected);
}

export async function sessionToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SESSION_LABEL));
  return toHex(new Uint8Array(signature));
}
