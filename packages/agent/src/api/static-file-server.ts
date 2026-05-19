/**
 * Static file serving for the built React dashboard (production mode).
 *
 * Extracted from server.ts — serves apps/app/dist/ with SPA fallback,
 * caching, and API-base injection for reverse-proxy deployments.
 */

import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@tokagentos/core";
import { resolveApiToken } from "@tokagentos/shared/runtime-env";
import { isCloudProvisionedContainer } from "./cloud-provisioning.js";
import { sendJsonError } from "./http-helpers.js";
import { getOrReadCachedFile } from "./memory-bounds.js";
import { findOwnPackageRoot } from "./server-helpers.js";

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------

const STATIC_MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".gz": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json",
  ".mjs": "application/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".vrm": "model/gltf-binary",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// ---------------------------------------------------------------------------
// UI directory resolution
// ---------------------------------------------------------------------------

/** Resolved UI directory. Lazily computed once on first request. */
let uiDir: string | null | undefined;
let uiIndexHtml: Buffer | null = null;

export function resolveUiDir(): string | null {
  if (uiDir !== undefined) return uiDir;
  if (process.env.NODE_ENV !== "production") {
    uiDir = null;
    return null;
  }

  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = findOwnPackageRoot(thisDir);
  const candidates = [
    path.resolve("apps/app/dist"),
    path.resolve(packageRoot, "apps", "app", "dist"),
  ];

  for (const candidate of candidates) {
    const indexPath = path.join(candidate, "index.html");
    try {
      if (fs.statSync(indexPath).isFile()) {
        uiDir = candidate;
        uiIndexHtml = fs.readFileSync(indexPath);
        logger.info(`[tokagent-api] Serving dashboard UI from ${candidate}`);
        return uiDir;
      }
    } catch {
      // Candidate not present, keep searching.
    }
  }

  uiDir = null;
  logger.info("[tokagent-api] No built UI found — dashboard routes are disabled");
  return null;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export function sendStaticResponse(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
  headers: Record<string, string | number>,
  body?: Buffer,
): void {
  res.writeHead(status, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}

// ---------------------------------------------------------------------------
// Static file cache
// ---------------------------------------------------------------------------

const STATIC_CACHE_MAX = 50;
const STATIC_CACHE_FILE_LIMIT = 512 * 1024; // 512 KB
const staticFileCache = new Map<string, { body: Buffer; mtimeMs: number }>();

function getCachedFile(filePath: string, mtimeMs: number): Buffer {
  return getOrReadCachedFile(
    staticFileCache,
    filePath,
    mtimeMs,
    (p) => fs.readFileSync(p),
    STATIC_CACHE_MAX,
    STATIC_CACHE_FILE_LIMIT,
  );
}

// ---------------------------------------------------------------------------
// API base injection (reverse-proxy support)
// ---------------------------------------------------------------------------

/**
 * Serve built dashboard assets from apps/app/dist with SPA fallback.
 * Returns true when the request is handled.
 */
export function injectApiBaseIntoHtml(
  html: Buffer,
  externalBase?: string | null,
  opts?: { apiToken?: string | null },
): Buffer {
  const trimmedBase = externalBase?.trim();
  const trimmedToken = opts?.apiToken?.trim();
  if (!trimmedBase && !trimmedToken) return html;

  const headCloseTag = "</head>";
  const headCloseIndex = html.indexOf(headCloseTag);
  if (headCloseIndex < 0) return html;

  const parts: string[] = [];
  if (trimmedBase) {
    parts.push(`window.__TOKAGENT_API_BASE__=${JSON.stringify(trimmedBase)};`);
  }
  if (trimmedToken) {
    parts.push(`window.__TOKAGENT_API_TOKEN__=${JSON.stringify(trimmedToken)};`);
  }
  const injection = Buffer.from(`<script>${parts.join("")}</script>`);

  return Buffer.concat([
    html.subarray(0, headCloseIndex),
    injection,
    html.subarray(headCloseIndex),
  ]);
}

// ---------------------------------------------------------------------------
// SPA serving
// ---------------------------------------------------------------------------

export function serveStaticUi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): boolean {
  const root = resolveUiDir();
  if (!root) return false;

  // Keep API and WebSocket namespaces exclusively owned by server handlers.
  if (isAuthProtectedRoute(pathname)) return false;

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJsonError(res, "Invalid URL path encoding", 400);
    return true;
  }

  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidatePath = path.resolve(root, relativePath);
  if (
    candidatePath !== root &&
    !candidatePath.startsWith(`${root}${path.sep}`)
  ) {
    sendJsonError(res, "Forbidden", 403);
    return true;
  }

  try {
    const stat = fs.statSync(candidatePath);
    if (stat.isFile()) {
      const ext = path.extname(candidatePath).toLowerCase();
      const body = getCachedFile(candidatePath, stat.mtimeMs);
      const isPreviewOrBinaryAsset =
        relativePath.startsWith("vrms/previews/") ||
        relativePath.startsWith("vrms/backgrounds/") ||
        [
          ".png",
          ".jpg",
          ".jpeg",
          ".gif",
          ".webp",
          ".avif",
          ".svg",
          ".mp3",
          ".wav",
          ".ogg",
          ".m4a",
          ".aac",
          ".flac",
          ".glb",
          ".spz",
        ].includes(ext);
      const cacheControl = relativePath.startsWith("assets/")
        ? "public, max-age=31536000, immutable"
        : ext === ".vrm" ||
            relativePath.endsWith(".vrm.gz") ||
            isPreviewOrBinaryAsset
          ? "public, max-age=86400"
          : "public, max-age=0, must-revalidate";
      sendStaticResponse(
        req,
        res,
        200,
        {
          "Cache-Control": cacheControl,
          "Content-Length": body.length,
          "Content-Type": STATIC_MIME[ext] ?? "application/octet-stream",
        },
        body,
      );
      return true;
    }
  } catch {
    // Missing file falls through to SPA index fallback below.
  }

  // Only serve the SPA index.html for navigation-like requests (no file extension
  // or .html). Asset requests (.vrm, .js, .png, etc.) that miss on disk should 404
  // rather than silently returning HTML — which breaks binary loaders like GLTFLoader.
  const reqExt = path.extname(decodedPath).toLowerCase();
  if (reqExt && reqExt !== ".html") return false;

  if (!uiIndexHtml) return false;

  // When served behind a reverse proxy that rewrites the app under a path prefix,
  // inject the API base so the UI client sends requests to the correct path prefix.
  // For cloud-provisioned containers, also inject the API token so the browser
  // client can authenticate without requiring a pairing flow.
  const cloudToken = isCloudProvisionedContainer()
    ? resolveApiToken(process.env)
    : null;
  const html = injectApiBaseIntoHtml(
    uiIndexHtml,
    process.env.TOKAGENT_EXTERNAL_BASE_URL,
    cloudToken ? { apiToken: cloudToken } : undefined,
  );

  sendStaticResponse(
    req,
    res,
    200,
    {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Length": html.length,
      "Content-Type": "text/html; charset=utf-8",
    },
    html,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Route classification
// ---------------------------------------------------------------------------

/**
 * Public path prefixes carved out of the `/v1/*` auth gate so the billing
 * plugin (plugin-tokagent-billing) can serve its client-facing routes from a
 * Railway-hosted billing-server without requiring the operator's
 * TOKAGENT_API_TOKEN. Every route under these prefixes is marked
 * `public: true` in the plugin's Route definitions and has its own auth layer
 * (SIWE EIP-712 LoginAuth + sk-ai-* HMAC API keys + per-route rate limits).
 *
 * The gate must allowlist them because `rawPath: true` plugin routes mount at
 * the literal /v1/* path and the `public: true` flag is not propagated to
 * `isAuthProtectedRoute` (which runs before plugin route resolution).
 */
// Path roots for billing-plugin public routes. Each entry matches BOTH the
// exact path (e.g. /v1/keys for the list/mint endpoints) AND any sub-path
// (e.g. /v1/keys/:id for the revoke endpoint). Stored without trailing slash;
// the check below adds one when comparing for the sub-path case so /v1/keys
// doesn't accidentally exempt /v1/keysomething.
const BILLING_PUBLIC_V1_ROOTS = [
  "/v1/auth",
  "/v1/billing",
  "/v1/topup",
  "/v1/credits",
  "/v1/usage",
  "/v1/keys",
  "/v1/estimate",
  "/v1/price",
  "/v1/messages", // /v1/messages (LiteLLM proxy) + /v1/messages/count_tokens
  "/v1/chat", // /v1/chat/completions (OpenAI shape, used by plugin-openai)
  "/v1/stats",
  "/v1/quote", // /v1/quote/:id
];

export function isAuthProtectedRoute(pathname: string): boolean {
  // Carve out billing-plugin public routes — they have their own auth
  // (SIWE EIP-712 LoginAuth + sk-ai-* HMAC API keys + per-route rate limits).
  if (
    BILLING_PUBLIC_V1_ROOTS.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    )
  ) {
    return false;
  }
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/v1" ||
    pathname.startsWith("/v1/") ||
    pathname === "/ws" ||
    pathname.startsWith("/ws/")
  );
}
