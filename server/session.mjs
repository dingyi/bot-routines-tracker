import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SESSION_LABEL = "bot-routines-session-v1";

/**
 * HMAC the Worker also computes. Both sides must stay on this label.
 * @param {string} password
 */
export function sessionToken(password) {
  return createHmac("sha256", password).update(SESSION_LABEL).digest("hex");
}

/**
 * @param {string} provided
 * @param {string} expected
 */
export function tokensMatch(provided, expected) {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

/**
 * @param {string} provided
 * @param {string} expected
 */
export function passwordMatches(provided, expected) {
  return tokensMatch(provided, expected);
}
