/**
 * Example only. Do not add this to the dashboard Worker.
 *
 * Grok Bot sync runs on the bot, every 15 minutes, via scripts/export-and-upload.sh.
 * Use a Worker cron only when the JSON already lives at an HTTPS URL and there is
 * no Grok Bot computer to wake. Keep the bucket private.
 *
 * wrangler.jsonc (a separate worker, or an extra handler you add yourself):
 * {
 *   "triggers": { "crons": [EXAMPLE_CRON] },
 *   "vars": { "ROUTINES_OBJECT_KEY": "routines.json" },
 *   "r2_buckets": [{ "binding": "ROUTINES_BUCKET", "bucket_name": "your-private-bucket" }]
 * }
 * Set ROUTINES_SOURCE_URL with `wrangler secret put` if the URL is private.
 */

export const EXAMPLE_CRON = "*/15 * * * *";

const worker = {
  /**
   * @param {unknown} _controller
   * @param {{ ROUTINES_BUCKET: { put: (key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }) => Promise<unknown> }, ROUTINES_OBJECT_KEY: string, ROUTINES_SOURCE_URL: string }} env
   */
  async scheduled(_controller, env) {
    const response = await fetch(env.ROUTINES_SOURCE_URL);
    if (!response.ok) {
      throw new Error(`source responded ${response.status}`);
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 8_000_000) {
      throw new Error("source object is too large");
    }
    await env.ROUTINES_BUCKET.put(env.ROUTINES_OBJECT_KEY, bytes, {
      httpMetadata: { contentType: "application/json" },
    });
  },
};

export default worker;
