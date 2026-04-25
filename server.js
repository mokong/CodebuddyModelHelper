#!/usr/bin/env node
import http from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const PORT = Number(process.env.PORT || 4310);
const HOST = process.env.HOST || "127.0.0.1";
const CONFIG_PATH = resolveHome(
  process.argv.find((arg) => arg.startsWith("--config="))?.slice("--config=".length) ||
    process.env.CODEBUDDY_MODELS_PATH ||
    path.join(os.homedir(), ".codebuddy", "models.json"),
);
const READONLY = String(process.env.READONLY || "").toLowerCase() === "true";
const KEEP_API_KEY = "__CODEBUDDY_MODELS_MANAGER_KEEP_API_KEY__";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function resolveHome(value) {
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}

function defaultConfig() {
  return { models: [], availableModels: [] };
}

function maskKey(key) {
  if (!key) return "";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}${"*".repeat(Math.min(12, key.length - 8))}${key.slice(-4)}`;
}

function publicModel(model) {
  const { apiKey, ...rest } = model;
  return {
    ...rest,
    originalId: model.originalId || model.id,
    hasApiKey: Boolean(apiKey),
    apiKeyMasked: maskKey(apiKey),
  };
}

async function readConfig({ includeSecrets = false } = {}) {
  if (!existsSync(CONFIG_PATH)) {
    return {
      exists: false,
      path: CONFIG_PATH,
      readonly: READONLY,
      config: defaultConfig(),
    };
  }

  const raw = await readFile(CONFIG_PATH, "utf8");
  const parsed = raw.trim() ? JSON.parse(raw) : defaultConfig();
  const normalized = normalizeConfig(parsed);

  return {
    exists: true,
    path: CONFIG_PATH,
    readonly: READONLY,
    config: includeSecrets
      ? normalized
      : {
          ...normalized,
          models: normalized.models.map(publicModel),
        },
  };
}

function normalizeConfig(value) {
  return {
    ...value,
    models: Array.isArray(value?.models) ? value.models : [],
    availableModels: Array.isArray(value?.availableModels) ? value.availableModels : [],
  };
}

function validateConfig(config) {
  const errors = [];
  const normalized = normalizeConfig(config);
  const ids = new Set();

  normalized.models.forEach((model, index) => {
    const label = model?.id || `第 ${index + 1} 个模型`;
    if (!model || typeof model !== "object") {
      errors.push(`第 ${index + 1} 个模型不是对象。`);
      return;
    }

    if (!model.id || typeof model.id !== "string") errors.push(`${label}: id 不能为空。`);
    if (model.id && ids.has(model.id)) errors.push(`${label}: id 重复。`);
    if (model.id) ids.add(model.id);
    if (!model.name || typeof model.name !== "string") errors.push(`${label}: name 不能为空。`);
    if (!model.vendor || typeof model.vendor !== "string") errors.push(`${label}: vendor 不能为空。`);
    if (!model.url || typeof model.url !== "string") {
      errors.push(`${label}: url 不能为空。`);
    } else if (!/^https?:\/\//i.test(model.url)) {
      errors.push(`${label}: url 必须以 http:// 或 https:// 开头。`);
    }

    for (const key of ["maxInputTokens", "maxOutputTokens"]) {
      if (!Number.isInteger(model[key]) || model[key] <= 0) {
        errors.push(`${label}: ${key} 必须是正整数。`);
      }
    }

    for (const key of ["supportsToolCall", "supportsImages", "supportsReasoning"]) {
      if (typeof model[key] !== "boolean") errors.push(`${label}: ${key} 必须是布尔值。`);
    }
  });

  normalized.availableModels.forEach((id, index) => {
    if (typeof id !== "string" || !id.trim()) {
      errors.push(`availableModels 第 ${index + 1} 项必须是非空字符串。`);
    }
  });

  return errors;
}

async function backupConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  const dir = path.join(path.dirname(CONFIG_PATH), "backups");
  await mkdir(dir, { recursive: true });
  const backupPath = path.join(dir, `models.${stamp}.json`);
  await writeFile(backupPath, await readFile(CONFIG_PATH, "utf8"), { mode: 0o600 });
  return backupPath;
}

async function writeConfig(nextConfig) {
  if (READONLY) throw new Error("当前是只读模式，不能保存。");

  const existing = (await readConfig({ includeSecrets: true })).config;
  const existingById = new Map(existing.models.map((model) => [model.id, model]));
  const normalized = normalizeConfig(nextConfig);

  const merged = {
    ...normalized,
    models: normalized.models.map((model) => {
      const previous = existingById.get(model.originalId || model.id);
      const next = { ...model };
      delete next.hasApiKey;
      delete next.apiKeyMasked;
      delete next.originalId;

      if (next.apiKey === KEEP_API_KEY || typeof next.apiKey === "undefined") {
        if (previous?.apiKey) next.apiKey = previous.apiKey;
        else delete next.apiKey;
      }

      return next;
    }),
  };

  const errors = validateConfig(merged);
  if (errors.length) {
    const error = new Error("配置校验失败。");
    error.status = 400;
    error.details = errors;
    throw error;
  }

  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  const backupPath = await backupConfig();
  const tmpPath = `${CONFIG_PATH}.${process.pid}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
  await rename(tmpPath, CONFIG_PATH);
  return { backupPath };
}

async function jsonBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function safePublicPath(urlPath) {
  const pathname = decodeURIComponent(urlPath.split("?")[0]);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const fullPath = path.normalize(path.join(publicDir, relative));
  if (!fullPath.startsWith(publicDir)) return null;
  return fullPath;
}

async function serveStatic(request, response) {
  const filePath = safePublicPath(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    const ext = path.extname(filePath);
    response.writeHead(200, { "content-type": contentTypes[ext] || "application/octet-stream" });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/config" && request.method === "GET") {
      sendJson(response, 200, await readConfig());
      return;
    }

    if (url.pathname === "/api/config" && request.method === "PUT") {
      const body = await jsonBody(request);
      const result = await writeConfig(body.config);
      sendJson(response, 200, { ok: true, ...result, config: (await readConfig()).config });
      return;
    }

    if (url.pathname === "/api/validate" && request.method === "POST") {
      const body = await jsonBody(request);
      const errors = validateConfig(body.config);
      sendJson(response, errors.length ? 400 : 200, { ok: errors.length === 0, errors });
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, error.status || 500, {
      ok: false,
      error: error.message || "服务器错误。",
      details: error.details || [],
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`CodeBuddy Models Manager is running at http://${HOST}:${PORT}`);
  console.log(`Config path: ${CONFIG_PATH}`);
  if (READONLY) console.log("Readonly mode is enabled.");
});
