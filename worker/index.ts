import { FeedError, publicMessage, readPrivateUrl } from "../server/remote-feed.mjs";
import { passwordMatches, sessionToken, tokensMatch } from "./session";

type RoutinesObject = {
  size: number;
  text: () => Promise<string>;
};

type AppEnv = {
  ASSETS: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
  ROUTINES_BUCKET: {
    get: (key: string) => Promise<RoutinesObject | null>;
  };
  ROUTINES_OBJECT_KEY: string;
  ROUTINES_URL?: string;
  ROUTINES_TOKEN?: string;
  SITE_PASSWORD: string;
};

const COOKIE = "br_session";
const MAX_BODY = 2048;
const MAX_OBJECT = 8_000_000;
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

function json(body: unknown, status: number, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return part.slice(separator + 1).trim();
  }
  return null;
}

function sessionCookie(token: string, maxAge: number): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function readSmallJson(request: Request): Promise<unknown> {
  const claimed = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(claimed) && claimed > MAX_BODY) {
    throw new Error("body too large");
  }
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error("body too large");
  return JSON.parse(text) as unknown;
}

function passwordReady(env: AppEnv): boolean {
  return env.SITE_PASSWORD.trim().length > 0;
}

async function unlocked(request: Request, env: AppEnv): Promise<boolean> {
  if (!passwordReady(env)) return false;
  const cookie = readCookie(request.headers.get("cookie"), COOKIE);
  if (!cookie) return false;
  const expected = await sessionToken(env.SITE_PASSWORD);
  return tokensMatch(cookie, expected);
}

function visitorFeed(error: FeedError): { status: number; error: string } {
  if (error.status === 404) return { status: 404, error: "routines.json is not available yet" };
  if (error.status === 413) return { status: 413, error: "routines object is too large" };
  if (error.status === 503) return { status: 503, error: "routines token is not configured" };
  return { status: 502, error: "routines feed failed" };
}

async function serveRemote(url: string, token: string): Promise<Response> {
  try {
    const body = await readPrivateUrl(url, token);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ message: "private feed failed", error: publicMessage(error) }));
    if (error instanceof FeedError) {
      const visitor = visitorFeed(error);
      return json({ error: visitor.error }, visitor.status);
    }
    return json({ error: "routines feed failed" }, 502);
  }
}

async function serveRoutines(request: Request, env: AppEnv): Promise<Response> {
  if (!passwordReady(env)) {
    return json({ error: "SITE_PASSWORD is not configured" }, 503);
  }
  if (!(await unlocked(request, env))) {
    return json({ error: "unauthorized" }, 401);
  }
  const remoteUrl = env.ROUTINES_URL?.trim() ?? "";
  if (remoteUrl) return serveRemote(remoteUrl, env.ROUTINES_TOKEN ?? "");
  const object = await env.ROUTINES_BUCKET.get(env.ROUTINES_OBJECT_KEY);
  if (!object) return json({ error: "routines.json is not in the bucket yet" }, 404);
  if (object.size > MAX_OBJECT) return json({ error: "routines object is too large" }, 413);
  const body = await object.text();
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function serveAuth(request: Request, env: AppEnv): Promise<Response> {
  const configured = passwordReady(env);
  return json(
    {
      mode: "worker",
      required: true,
      configured,
      unlocked: configured ? await unlocked(request, env) : false,
    },
    200,
  );
}

async function serveSession(request: Request, env: AppEnv): Promise<Response> {
  if (!passwordReady(env)) return json({ error: "SITE_PASSWORD is not configured" }, 503);
  let payload: unknown;
  try {
    payload = await readSmallJson(request);
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const password = isRecord(payload) && typeof payload.password === "string" ? payload.password : "";
  if (password.length === 0 || password.length > 512) return json({ error: "unauthorized" }, 401);
  const matches = await passwordMatches(password, env.SITE_PASSWORD);
  if (!matches) return json({ error: "unauthorized" }, 401);
  const token = await sessionToken(env.SITE_PASSWORD);
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "set-cookie": sessionCookie(token, SESSION_MAX_AGE),
    },
  });
}

function serveLogout(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "set-cookie": sessionCookie("", 0),
    },
  });
}

export async function handleRequest(request: Request, env: AppEnv): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

  try {
    if (pathname === "/api/auth" && request.method === "GET") return await serveAuth(request, env);
    if (pathname === "/api/session" && request.method === "POST") return await serveSession(request, env);
    if (pathname === "/api/logout" && request.method === "POST") return serveLogout();
    if (pathname === "/routines.json" && request.method === "GET") return await serveRoutines(request, env);
    if (pathname === "/api/auth" || pathname === "/api/session" || pathname === "/api/logout" || pathname === "/routines.json") {
      return json({ error: "method not allowed" }, 405);
    }
    return env.ASSETS.fetch(request);
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "worker request failed",
        path: pathname,
        error: publicMessage(error),
      }),
    );
    return json({ error: "request failed" }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
