const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const helmet = require("helmet");
const path = require("path");
const rateLimit = require("express-rate-limit");

const { jsonStore } = require("./middleware/jsonStore");

const app = express();
app.set("trust proxy", 1);

const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIRS = [
  process.env.PUBLIC_DIR ? path.resolve(process.env.PUBLIC_DIR) : null,
  ROOT_DIR,
  __dirname
].filter(Boolean);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const ENTRIES_FILE = "entries.json";
const ACTIVITY_FILE = "activity.json";
const DRAWS_FILE = "draws.json";

const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_COOKIE = "aurora_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const sessions = new Map();
const RESERVED_MOUNT_NAMES = new Set([
  "admin",
  "api",
  "assets",
  "health",
  "html.html",
  "panel-admin-aurora-2026.html"
]);
const MOUNTABLE_PATH_ROOTS = new Set([
  "admin",
  "api",
  "assets",
  "health",
  "html.html",
  "panel-admin-aurora-2026.html"
]);

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(express.json({ limit: "1mb" }));

function appendOriginalQuery(req, targetPath) {
  const queryIndex = req.originalUrl.indexOf("?");
  return queryIndex === -1 ? targetPath : `${targetPath}${req.originalUrl.slice(queryIndex)}`;
}

function normalizePathPart(value) {
  return String(value || "").trim().toLowerCase();
}

function isMountCandidate(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const normalized = normalizePathPart(value);
  return /^[a-z0-9_-]+$/i.test(raw) && !RESERVED_MOUNT_NAMES.has(normalized);
}

function redirectAdminTrailingSlash(req, res, next) {
  if (!req.path.toLowerCase().endsWith("/admin/")) {
    next();
    return;
  }

  res.redirect(308, appendOriginalQuery(req, req.path.slice(0, -1)));
}

function stripSingleMountPrefix(req, res, next) {
  const pathWithoutQuery = req.url.split("?")[0];
  const pathParts = pathWithoutQuery.split("/").filter(Boolean);
  const [mountName, routeRoot] = pathParts;

  if (
    pathParts.length >= 2 &&
    isMountCandidate(mountName) &&
    MOUNTABLE_PATH_ROOTS.has(normalizePathPart(routeRoot))
  ) {
    const mountPrefix = `/${mountName}`;
    req.url = req.url.slice(mountPrefix.length) || "/";
    res.locals.publicBasePath = mountPrefix;
  }

  next();
}

function servePublicPage(req, res) {
  res.sendFile(resolvePublicFile("HTML.html"));
}

function serveAdminPage(req, res) {
  res.sendFile(resolvePublicFile("panel-admin-aurora-2026.html"));
}

function serveMountedPublicPage(req, res, next) {
  const mountName = req.params.mount;

  if (!isMountCandidate(mountName)) {
    next();
    return;
  }

  if (!req.path.endsWith("/")) {
    res.redirect(308, appendOriginalQuery(req, `${req.path}/`));
    return;
  }

  servePublicPage(req, res);
}

app.use(redirectAdminTrailingSlash);
app.use(stripSingleMountPrefix);
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 150,
    standardHeaders: true,
    legacyHeaders: false
  })
);

PUBLIC_DIRS.forEach((publicDir) => {
  app.use("/assets", express.static(path.join(publicDir, "assets")));
});

function resolvePublicFile(filename) {
  const publicFile = PUBLIC_DIRS.map((publicDir) => path.join(publicDir, filename)).find((filePath) =>
    fs.existsSync(filePath)
  );

  return publicFile || path.join(ROOT_DIR, filename);
}

function normalizeName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildEntry(payload) {
  return {
    id: crypto.randomUUID(),
    fullName: normalizeName(payload.fullName),
    ci: normalizeDigits(payload.ci),
    phone: normalizePhone(payload.phone),
    email: normalizeEmail(payload.email),
    hasLot: payload.hasLot === true,
    consent: Boolean(payload.consent),
    source: "public-form",
    createdAt: new Date().toISOString()
  };
}

function validateEntryData(entry, existingEntries) {
  if (String(entry.companyWebsite || "").trim()) {
    return { valid: false, field: "companyWebsite", message: "No se pudo validar el envio." };
  }

  if (!entry.fullName || entry.fullName.length < 5 || entry.fullName.split(/\s+/).length < 2) {
    return { valid: false, field: "fullName", message: "Ingresa nombre y apellido validos." };
  }

  if (!/^(?=.{5,120}$)[\p{L}\s'.,-]+$/u.test(entry.fullName)) {
    return { valid: false, field: "fullName", message: "El nombre contiene caracteres no permitidos." };
  }

  if (!/^\d{5,12}$/.test(entry.ci)) {
    return { valid: false, field: "ci", message: "La cedula debe contener entre 5 y 12 digitos." };
  }

  if (!/^\d{9,15}$/.test(entry.phone)) {
    return { valid: false, field: "phone", message: "El numero de celular debe contener entre 9 y 15 digitos." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email)) {
    return { valid: false, field: "email", message: "Ingresa un correo electronico valido." };
  }

  if (typeof entry.hasLot !== "boolean") {
    return { valid: false, field: "hasLot", message: "Indica si el cliente tiene lote o no." };
  }

  if (!entry.consent) {
    return { valid: false, field: "consent", message: "Debes autorizar el uso de datos para continuar." };
  }

  if (existingEntries.some((item) => item.ci === entry.ci)) {
    return { valid: false, field: "ci", message: `La cedula ${entry.ci} ya fue registrada.` };
  }

  return { valid: true };
}

async function readEntries() {
  return jsonStore.read(DATA_DIR, ENTRIES_FILE, []);
}

async function writeEntries(entries) {
  await jsonStore.write(DATA_DIR, ENTRIES_FILE, entries);
}

async function readDraws() {
  return jsonStore.read(DATA_DIR, DRAWS_FILE, []);
}

async function writeDraws(draws) {
  await jsonStore.write(DATA_DIR, DRAWS_FILE, draws);
}

async function addActivity(type, detail) {
  const activity = await jsonStore.read(DATA_DIR, ACTIVITY_FILE, []);
  activity.unshift({
    id: crypto.randomUUID(),
    type,
    detail,
    createdAt: new Date().toISOString()
  });
  await jsonStore.write(DATA_DIR, ACTIVITY_FILE, activity.slice(0, 200));
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) return accumulator;
      const key = part.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(part.slice(separatorIndex + 1));
      accumulator[key] = value;
      return accumulator;
    }, {});
}

function createSession(res) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
}

function clearSession(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function requireAdmin(req, res, next) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  const expiresAt = token ? sessions.get(token) : null;

  if (!token || !expiresAt || expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    clearSession(res);
    res.status(401).json({ message: "Sesion no valida." });
    return;
  }

  sessions.set(token, Date.now() + SESSION_TTL_MS);
  req.adminUser = ADMIN_USER;
  next();
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildSummary(entries, draws) {
  const now = new Date();
  const today = dayKey(now);
  const last7Days = new Date(now);
  last7Days.setDate(last7Days.getDate() - 6);

  const withLot = entries.filter((entry) => entry.hasLot).length;
  const withoutLot = entries.length - withLot;
  const todayCount = entries.filter((entry) => {
    const parsed = parseIsoDate(entry.createdAt);
    return parsed && dayKey(parsed) === today;
  }).length;

  const dailyMap = new Map();
  const lotMap = new Map([
    ["Con lote", withLot],
    ["Sin lote", withoutLot]
  ]);

  entries.forEach((entry) => {
    const parsed = parseIsoDate(entry.createdAt);
    if (!parsed) return;
    const key = dayKey(parsed);
    dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
  });

  const dailySeries = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    const key = dayKey(date);
    dailySeries.push({
      label: key.slice(5),
      value: dailyMap.get(key) || 0
    });
  }

  const peakDayEntry =
    Array.from(dailyMap.entries()).sort((left, right) => right[1] - left[1])[0] || null;

  const selectedIds = new Set();
  draws.forEach((draw) => {
    (draw.winnerIds || []).forEach((id) => selectedIds.add(id));
    (draw.reserveIds || []).forEach((id) => selectedIds.add(id));
  });

  return {
    total: entries.length,
    withLot,
    withoutLot,
    todayCount,
    drawCount: draws.length,
    uniqueSelectedCount: selectedIds.size,
    availableForFreshDraw: Math.max(0, entries.length - selectedIds.size),
    latestEntry: entries[0] || null,
    peakDay: peakDayEntry ? { label: peakDayEntry[0], value: peakDayEntry[1] } : null,
    lotBreakdown: Array.from(lotMap.entries()).map(([label, value]) => ({ label, value })),
    dailySeries,
    recentActivityCount: entries.filter((entry) => {
      const parsed = parseIsoDate(entry.createdAt);
      return parsed && parsed >= last7Days;
    }).length
  };
}

function getEligibleEntries(entries, draws, options = {}) {
  const filter = ["all", "with", "without"].includes(options.filter) ? options.filter : "all";
  const excludePrevious = Boolean(options.excludePrevious);
  const excluded = new Set();

  if (excludePrevious) {
    draws.forEach((draw) => {
      (draw.winnerIds || []).forEach((id) => excluded.add(id));
      (draw.reserveIds || []).forEach((id) => excluded.add(id));
    });
  }

  return entries.filter((entry) => {
    if (filter === "with" && !entry.hasLot) return false;
    if (filter === "without" && entry.hasLot) return false;
    if (excluded.has(entry.id)) return false;
    return true;
  });
}

function pickRandomEntries(pool, count) {
  const available = pool.slice();
  const selected = [];

  while (available.length && selected.length < count) {
    const index = Math.floor(Math.random() * available.length);
    selected.push(available.splice(index, 1)[0]);
  }

  return selected;
}

function validateDrawPayload(payload) {
  const winnerCount = Number.parseInt(payload.winnerCount, 10);
  const reserveCount = Number.parseInt(payload.reserveCount || 0, 10);

  if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 100) {
    return { valid: false, message: "La cantidad de ganadores debe ser un numero entre 1 y 100." };
  }

  if (!Number.isInteger(reserveCount) || reserveCount < 0 || reserveCount > 100) {
    return { valid: false, message: "La cantidad de suplentes debe ser un numero entre 0 y 100." };
  }

  return {
    valid: true,
    normalized: {
      title: normalizeName(payload.title || "Sorteo Aurora"),
      notes: String(payload.notes || "").trim(),
      filter: ["all", "with", "without"].includes(payload.filter) ? payload.filter : "all",
      winnerCount,
      reserveCount,
      excludePrevious: Boolean(payload.excludePrevious)
    }
  };
}

app.get("/api/public/config", async (req, res) => {
  const entries = await readEntries();
  res.json({
    status: "ok",
    totalEntries: entries.length,
    serverTime: new Date().toISOString()
  });
});

app.get("/api/public/entries/check", async (req, res) => {
  const ci = normalizeDigits(req.query.ci);
  const entries = await readEntries();
  res.json({ exists: Boolean(ci) && entries.some((entry) => entry.ci === ci) });
});

app.post("/api/public/entries", async (req, res) => {
  const existingEntries = await readEntries();
  const candidate = buildEntry(req.body || {});
  candidate.companyWebsite = String(req.body?.companyWebsite || "");

  const validation = validateEntryData(candidate, existingEntries);
  if (!validation.valid) {
    res.status(400).json(validation);
    return;
  }

  existingEntries.unshift({
    id: candidate.id,
    fullName: candidate.fullName,
    ci: candidate.ci,
    phone: candidate.phone,
    email: candidate.email,
    hasLot: candidate.hasLot,
    consent: candidate.consent,
    source: candidate.source,
    createdAt: candidate.createdAt
  });

  await writeEntries(existingEntries);
  await addActivity("entry-created", `${candidate.fullName} (${candidate.ci})`);

  res.status(201).json({
    success: true,
    message: "Registro guardado correctamente.",
    entry: candidate
  });
});

app.get("/api/admin/session", requireAdmin, (req, res) => {
  res.json({ authenticated: true, user: req.adminUser });
});

app.post("/api/admin/login", (req, res) => {
  const user = String(req.body?.adminUser || "").trim();
  const password = String(req.body?.adminPassword || "");

  if (user !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    res.status(401).json({ message: "Credenciales invalidas." });
    return;
  }

  createSession(res);
  res.json({ success: true, user: ADMIN_USER });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (token) sessions.delete(token);
  clearSession(res);
  res.json({ success: true });
});

app.get("/api/admin/dashboard", requireAdmin, async (req, res) => {
  const [entries, activity, draws] = await Promise.all([
    readEntries(),
    jsonStore.read(DATA_DIR, ACTIVITY_FILE, []),
    readDraws()
  ]);

  res.json({
    entries,
    activity,
    draws,
    summary: buildSummary(entries, draws)
  });
});

app.post("/api/admin/draws", requireAdmin, async (req, res) => {
  const validation = validateDrawPayload(req.body || {});
  if (!validation.valid) {
    res.status(400).json({ message: validation.message });
    return;
  }

  const [entries, draws] = await Promise.all([readEntries(), readDraws()]);
  const eligible = getEligibleEntries(entries, draws, validation.normalized);
  const needed = validation.normalized.winnerCount + validation.normalized.reserveCount;

  if (!eligible.length) {
    res.status(400).json({ message: "No hay participantes disponibles para este sorteo." });
    return;
  }

  if (eligible.length < validation.normalized.winnerCount) {
    res.status(400).json({ message: "No hay suficientes participantes para cubrir la cantidad de ganadores." });
    return;
  }

  const picked = pickRandomEntries(eligible, Math.min(needed, eligible.length));
  const winners = picked.slice(0, validation.normalized.winnerCount);
  const reserves = picked.slice(validation.normalized.winnerCount);

  const draw = {
    id: crypto.randomUUID(),
    title: validation.normalized.title,
    notes: validation.normalized.notes,
    filter: validation.normalized.filter,
    winnerIds: winners.map((entry) => entry.id),
    reserveIds: reserves.map((entry) => entry.id),
    excludePrevious: validation.normalized.excludePrevious,
    createdAt: new Date().toISOString()
  };

  draws.unshift(draw);
  await writeDraws(draws);
  await addActivity("draw-created", `${draw.title} | ${winners.length} ganador(es)`);

  res.status(201).json({
    success: true,
    draw,
    winners,
    reserves,
    eligibleCount: eligible.length
  });
});

app.delete("/api/admin/entries/:id", requireAdmin, async (req, res) => {
  const entries = await readEntries();
  const nextEntries = entries.filter((entry) => entry.id !== req.params.id);

  if (nextEntries.length === entries.length) {
    res.status(404).json({ message: "Registro no encontrado." });
    return;
  }

  await writeEntries(nextEntries);
  await addActivity("entry-deleted", `Registro ${req.params.id} eliminado`);
  res.json({ success: true });
});

app.get("/", servePublicPage);

app.get("/HTML.html", servePublicPage);

app.get("/admin", serveAdminPage);

app.get("/panel-admin-aurora-2026.html", serveAdminPage);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/:mount/", serveMountedPublicPage);
app.get("/:mount", serveMountedPublicPage);

app.use((req, res) => {
  res.status(404).json({ message: "Ruta no encontrada." });
});

async function ensureDataFiles() {
  await jsonStore.write(DATA_DIR, ENTRIES_FILE, await jsonStore.read(DATA_DIR, ENTRIES_FILE, []));
  await jsonStore.write(DATA_DIR, ACTIVITY_FILE, await jsonStore.read(DATA_DIR, ACTIVITY_FILE, []));
  await jsonStore.write(DATA_DIR, DRAWS_FILE, await jsonStore.read(DATA_DIR, DRAWS_FILE, []));
}

ensureDataFiles()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Aurora Sorteo disponible en http://localhost:${PORT}`);
      console.log(`Panel administrativo en http://localhost:${PORT}/admin`);
      console.log(`Usuario admin por defecto: ${ADMIN_USER}`);
    });
  })
  .catch((error) => {
    console.error("No se pudo iniciar el servidor:", error);
    process.exit(1);
  });
