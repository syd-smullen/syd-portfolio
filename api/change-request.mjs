import { createHash, timingSafeEqual } from "node:crypto";

const SOURCE = "syd-portfolio";
const MAX_MESSAGE = 4000;
const MAX_PAGE_URL = 2000;
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;
const MAX_DATA_URL_CHARS = 1024 * 1024;
const WINDOW_MS = 60_000;
const MAX_HITS = 20;
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function env(name) {
  return (process.env[name] || "").trim();
}

function json(status, body, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function notConfigured() {
  return json(503, { error: "Change requests are not configured yet." });
}

function methodNotAllowed() {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: "OPTIONS, POST",
      "Cache-Control": "no-store",
    },
  });
}

function keysMatch(provided, expected) {
  const a = createHash("sha256").update(String(provided), "utf8").digest();
  const b = createHash("sha256").update(String(expected), "utf8").digest();
  return timingSafeEqual(a, b);
}

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first.slice(0, 80);
  }
  return (request.headers.get("x-real-ip") || "unknown").slice(0, 80);
}

function rateLimited(ip) {
  const now = Date.now();
  const store = globalThis.__sydChangeRate || (globalThis.__sydChangeRate = new Map());
  const recent = (store.get(ip) || []).filter((stamp) => now - stamp < WINDOW_MS);
  if (recent.length >= MAX_HITS) {
    store.set(ip, recent);
    return true;
  }
  recent.push(now);
  store.set(ip, recent);
  if (store.size > 2000) {
    for (const [key, times] of store) {
      if (!times.some((stamp) => now - stamp < WINDOW_MS)) store.delete(key);
    }
  }
  return false;
}

function timestampInNewYork(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  let offset = get("timeZoneName").replace(/^GMT/i, "");
  if (!offset) offset = "+00:00";
  if (/^[+-]\d{4}$/.test(offset)) {
    offset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
  }
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}${offset}`;
}

function pagePathFrom(pageUrl) {
  try {
    return new URL(pageUrl).pathname || "/";
  } catch {
    if (typeof pageUrl === "string" && pageUrl.startsWith("/")) {
      const end = pageUrl.search(/[?#]/);
      return end === -1 ? pageUrl : pageUrl.slice(0, end);
    }
    return "";
  }
}

function webhookTarget() {
  const raw = env("CHANGE_REQUEST_WEBHOOK_URL");
  const key = env("CHANGE_REQUEST_WEBHOOK_KEY");
  if (!raw || !key) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { url: url.toString(), key };
  } catch {
    return null;
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function textField(form, name) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function isUpload(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.arrayBuffer === "function" &&
      typeof value.size === "number" &&
      value.size > 0,
  );
}

async function screenshotFrom(file) {
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return { error: "Screenshot must be under 3 MB." };
  }
  const rawType = String(file.type || "").toLowerCase();
  const type = rawType === "image/jpg" ? "image/jpeg" : rawType;
  if (!IMAGE_TYPES.has(type)) {
    return { error: "Screenshot must be a PNG, JPEG, WebP, or GIF." };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${type};base64,${bytes.toString("base64")}`;
  if (dataUrl.length <= MAX_DATA_URL_CHARS) {
    return { dataUrl };
  }
  const kb = Math.max(1, Math.round(file.size / 1024));
  return {
    note: `Screenshot omitted (${kb} KB). It is over the 1 MB attachment limit.`,
  };
}

async function sendWebhook(payload) {
  const target = webhookTarget();
  if (!target) return notConfigured();
  let response;
  try {
    response = await fetch(target.url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${target.key}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return json(502, { error: "Couldn't send that. Try again." });
  }
  if (response.status < 200 || response.status >= 300) {
    return json(502, { error: "Couldn't send that. Try again." });
  }
  return json(200, { ok: true });
}

async function verify(body) {
  const ownerKey = env("CHANGE_REQUEST_KEY");
  if (!ownerKey) return notConfigured();
  const provided = typeof body?.key === "string" ? body.key : "";
  if (!provided || provided.length > 500 || !keysMatch(provided, ownerKey)) {
    return json(401, { error: "Unauthorized." });
  }
  return json(200, { ok: true });
}

async function submit(form, request) {
  const ownerKey = env("CHANGE_REQUEST_KEY");
  if (!ownerKey) return notConfigured();
  const provided = textField(form, "key");
  if (!provided || provided.length > 500 || !keysMatch(provided, ownerKey)) {
    return json(401, { error: "Unauthorized." });
  }

  const message = textField(form, "message").trim();
  if (!message) return json(400, { error: "Write what you want changed." });
  if (message.length > MAX_MESSAGE) {
    return json(400, { error: "Keep it under 4000 characters." });
  }

  const pageUrl = textField(form, "pageUrl").trim().slice(0, MAX_PAGE_URL);
  const payload = {
    source: SOURCE,
    request: message,
    pageUrl,
    pagePath: pagePathFrom(pageUrl),
    timestamp: timestampInNewYork(),
    userAgent: (request.headers.get("user-agent") || "").slice(0, 500),
  };

  const upload = form.get("screenshot");
  if (isUpload(upload)) {
    const shot = await screenshotFrom(upload);
    if (shot.error) return json(400, { error: shot.error });
    if (shot.dataUrl) payload.screenshotDataUrl = shot.dataUrl;
    else payload.screenshotNote = shot.note;
  }

  return sendWebhook(payload);
}

export async function POST(request) {
  if (rateLimited(clientIp(request))) {
    return json(429, { error: "Too many requests. Try again in a minute." }, {
      "Retry-After": "60",
    });
  }

  if (!env("CHANGE_REQUEST_KEY")) return notConfigured();

  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(400, { error: "Unsupported request." });
    }
    if (body.intent === "verify") return verify(body);
    return json(400, { error: "Unsupported request." });
  }

  if (contentType.includes("multipart/form-data")) {
    let form;
    try {
      form = await request.formData();
    } catch {
      return json(400, { error: "Unsupported request." });
    }
    if (textField(form, "intent") !== "submit") {
      return json(400, { error: "Unsupported request." });
    }
    return submit(form, request);
  }

  return json(400, { error: "Unsupported request." });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "OPTIONS, POST",
      "Cache-Control": "no-store",
    },
  });
}

export function GET() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}

export function HEAD() {
  return methodNotAllowed();
}
