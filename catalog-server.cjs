const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { put } = require("@vercel/blob");

const publicRoot = path.join(__dirname, "public");
const uploadsRoot = path.join(publicRoot, "uploads");
const dataRoot = path.join(__dirname, "data");
const productsFile = path.join(dataRoot, "products.json");
const seedProducts = require("./data/products.json");
const isVercelDeployment = process.env.VERCEL === "1";
const port = Number(process.env.PORT || 3000);
const whatsappNumber = (process.env.WHATSAPP_NUMBER || "5514991107618").replace(/\D/g, "");
const adminPassword = process.env.ADMIN_PASSWORD || "";
const adminSessionSecret = process.env.ADMIN_SESSION_SECRET
  || (isVercelDeployment ? "" : crypto.randomBytes(32).toString("base64url"));
const sessions = new Map();
const loginAttempts = new Map();
let writeQueue = Promise.resolve();
const productsKey = "thunder-sthormy:products:v1";
const loginWindowSeconds = 15 * 60;
const maxImageBytes = 2 * 1024 * 1024;
const maxImageRequestBytes = 3 * 1024 * 1024;

const categories = new Set(["OVERSIZED", "PERUANA", "BERMUDA"]);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

if (!isVercelDeployment && (!Number.isInteger(port) || port < 1 || port > 65535)) {
  throw new Error("PORT precisa ser um número entre 1 e 65535.");
}
if (whatsappNumber.length < 10 || whatsappNumber.length > 15) {
  throw new Error("WHATSAPP_NUMBER precisa incluir o código do país e o DDD.");
}

function sendJson(response, status, value, extraHeaders = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(JSON.stringify(value));
}

function readJson(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("O envio excede o limite permitido."), { status: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Envie um JSON válido."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function getSessionToken(request) {
  const cookie = request.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)thunder_session=(\d+\.[a-f0-9]+\.[a-f0-9]+)/);
  if (!match || !adminSessionSecret) return null;
  const [expiresAt, nonce, signature] = match[1].split(".");
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return null;
  const payload = `${expiresAt}.${nonce}`;
  const expected = crypto.createHmac("sha256", adminSessionSecret).update(payload).digest();
  const actual = Buffer.from(signature, "hex");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  return { expiresAt: Number(expiresAt), nonce };
}

async function getSession(request) {
  const token = getSessionToken(request);
  if (!token) return false;
  if (isVercelDeployment) {
    if (!hasRedisConfig()) return false;
    return await redisCommand("GET", `thunder-sthormy:session:${token.nonce}`) === "1";
  }
  const session = sessions.get(token.nonce);
  if (!session || session.expiresAt !== token.expiresAt || session.expiresAt <= Math.floor(Date.now() / 1000)) {
    sessions.delete(token.nonce);
    return false;
  }
  return true;
}

async function requireAdmin(request, response) {
  if (!await getSession(request)) {
    sendJson(response, 401, { error: "Entre na área da loja para continuar." });
    return false;
  }
  return true;
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeProduct(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("Dados do produto inválidos."), { status: 400 });
  }

  const title = cleanText(payload.title, 80);
  const description = cleanText(payload.description, 1000);
  const category = cleanText(payload.category, 30).toUpperCase();
  const color = cleanText(payload.color, 50);
  const sizes = Array.isArray(payload.sizes)
    ? [...new Set(payload.sizes.map((size) => cleanText(size, 20)).filter(Boolean))].slice(0, 12)
    : [];
  const images = Array.isArray(payload.images)
    ? [...new Set(payload.images.filter(isAllowedImagePath))].slice(0, 6)
    : [];
  const price = payload.price === "" || payload.price === null || payload.price === undefined
    ? null
    : Number(payload.price);

  if (title.length < 2) throw Object.assign(new Error("Informe o nome da peça."), { status: 400 });
  if (!description) throw Object.assign(new Error("Informe a descrição da peça."), { status: 400 });
  if (!categories.has(category)) throw Object.assign(new Error("Escolha uma categoria válida."), { status: 400 });
  if (!color) throw Object.assign(new Error("Informe a cor da peça."), { status: 400 });
  if (!images.length) throw Object.assign(new Error("Adicione pelo menos uma foto válida."), { status: 400 });
  if (price !== null && (!Number.isFinite(price) || price <= 0 || price > 10000000)) {
    throw Object.assign(new Error("Informe um preço válido ou deixe o campo vazio."), { status: 400 });
  }

  return {
    title,
    description,
    category,
    color,
    sizes,
    images,
    price,
    active: payload.active !== false,
  };
}

function isAllowedImagePath(value) {
  if (typeof value !== "string" || value.length > 250) return false;
  if (value.startsWith("/assets/products/") || value.startsWith("/uploads/")) {
    return !value.includes("..") && !value.includes("\\") && !value.includes("?") && !value.includes("#");
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.endsWith(".public.blob.vercel-storage.com")
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function hasRedisConfig() {
  return Boolean(getRedisUrl() && getRedisToken());
}

function getRedisUrl() {
  return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
}

function getRedisToken() {
  return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
}

function getAdminConfiguration() {
  const missing = [];
  if (adminPassword.length < 16) missing.push("ADMIN_PASSWORD (mínimo 16 caracteres)");
  if (Buffer.byteLength(adminSessionSecret || "", "utf8") < 32) {
    missing.push("ADMIN_SESSION_SECRET (segredo aleatório de pelo menos 32 caracteres)");
  }
  if (isVercelDeployment && !hasRedisConfig()) {
    missing.push("UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN ou KV_REST_API_URL/KV_REST_API_TOKEN");
  }
  return {
    enabled: missing.length === 0,
    missing,
    imageUploadsEnabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  };
}

async function redisCommand(...command) {
  if (!hasRedisConfig()) {
    throw Object.assign(new Error("Configure o banco Upstash Redis nas variáveis do servidor."), { status: 503 });
  }
  const baseUrl = getRedisUrl().replace(/\/+$/, "");
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getRedisToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    console.error("A operação no banco do catálogo falhou:", response.status);
    throw Object.assign(new Error("Não foi possível acessar o armazenamento do catálogo."), { status: 503 });
  }
  return result.result;
}

async function loadProducts() {
  if (isVercelDeployment) {
    if (!hasRedisConfig()) return seedProducts;
    const storedProducts = await redisCommand("GET", productsKey);
    if (storedProducts !== null) {
      const products = JSON.parse(storedProducts);
      if (!Array.isArray(products)) throw new Error("O catálogo precisa ser uma lista de produtos.");
      return products;
    }
    await redisCommand("SET", productsKey, JSON.stringify(seedProducts), "NX");
    const initializedProducts = await redisCommand("GET", productsKey);
    const products = JSON.parse(initializedProducts || JSON.stringify(seedProducts));
    if (!Array.isArray(products)) throw new Error("O catálogo precisa ser uma lista de produtos.");
    return products;
  }
  const contents = await fs.readFile(productsFile, "utf8");
  const products = JSON.parse(contents);
  if (!Array.isArray(products)) throw new Error("O catálogo precisa ser uma lista de produtos.");
  return products;
}

function saveProducts(products) {
  if (isVercelDeployment) return redisCommand("SET", productsKey, JSON.stringify(products));
  writeQueue = writeQueue.then(async () => {
    const temporaryFile = `${productsFile}.tmp`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(products, null, 2)}\n`, "utf8");
    await fs.rename(temporaryFile, productsFile);
  });
  return writeQueue;
}

function imageHasValidSignature(buffer, mimeType) {
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  if (mimeType === "image/webp") return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  return false;
}

function checkLoginLimit(request, response) {
  const address = getClientAddress(request);
  const attempt = loginAttempts.get(address);
  if (attempt && attempt.blockedUntil > Date.now()) {
    sendJson(response, 429, { error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." });
    return false;
  }
  return true;
}

function getClientAddress(request) {
  const forwardedAddress = request.headers["x-forwarded-for"];
  if (typeof forwardedAddress === "string" && forwardedAddress.length) {
    return forwardedAddress.split(",").at(-1).trim().slice(0, 100);
  }
  return request.socket?.remoteAddress || "unknown";
}

async function checkCloudLoginLimit(request, response) {
  const address = crypto.createHmac("sha256", adminSessionSecret).update(getClientAddress(request)).digest("hex");
  const attempts = Number(await redisCommand("GET", `thunder-sthormy:login:${address}`) || 0);
  if (attempts >= 5) {
    sendJson(response, 429, { error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." });
    return false;
  }
  return true;
}

async function recordFailedLogin(request) {
  const address = getClientAddress(request);
  if (isVercelDeployment) {
    const hashedAddress = crypto.createHmac("sha256", adminSessionSecret).update(address).digest("hex");
    const script = "local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return count";
    await redisCommand("EVAL", script, "1", `thunder-sthormy:login:${hashedAddress}`, String(loginWindowSeconds));
    return;
  }
  const attempt = loginAttempts.get(address);
  const failures = attempt && attempt.blockedUntil <= Date.now() ? attempt.failures : 0;
  const nextFailures = failures + 1;
  loginAttempts.set(address, {
    failures: nextFailures,
    blockedUntil: nextFailures >= 5 ? Date.now() + 15 * 60 * 1000 : 0,
  });
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/config" && request.method === "GET") {
    sendJson(response, 200, { whatsappNumber });
    return true;
  }

  if (url.pathname === "/api/session" && request.method === "GET") {
    const configuration = getAdminConfiguration();
    sendJson(response, 200, {
      authenticated: configuration.enabled && await getSession(request),
      adminEnabled: configuration.enabled,
      imageUploadsEnabled: configuration.imageUploadsEnabled,
      missing: configuration.missing,
    });
    return true;
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    const configuration = getAdminConfiguration();
    if (!configuration.enabled) {
      sendJson(response, 503, {
        error: `Área da loja indisponível. Configure no servidor: ${configuration.missing.join("; ")}.`,
      });
      return true;
    }
    const allowed = isVercelDeployment
      ? await checkCloudLoginLimit(request, response)
      : checkLoginLimit(request, response);
    if (!allowed) return true;
    const body = await readJson(request, 4096);
    const submittedPassword = typeof body.password === "string" ? body.password : "";
    const expected = Buffer.from(adminPassword);
    const actual = Buffer.from(submittedPassword);
    const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    if (!valid) {
      await recordFailedLogin(request);
      sendJson(response, 401, { error: "Senha incorreta." });
      return true;
    }
    const address = getClientAddress(request);
    loginAttempts.delete(address);
    if (isVercelDeployment) {
      const hashedAddress = crypto.createHmac("sha256", adminSessionSecret).update(address).digest("hex");
      await redisCommand("DEL", `thunder-sthormy:login:${hashedAddress}`);
    }
    const expiresAt = Math.floor(Date.now() / 1000) + 8 * 60 * 60;
    const nonce = crypto.randomBytes(16).toString("hex");
    const payload = `${expiresAt}.${nonce}`;
    const signature = crypto.createHmac("sha256", adminSessionSecret).update(payload).digest("hex");
    const token = `${payload}.${signature}`;
    if (isVercelDeployment) {
      await redisCommand("SET", `thunder-sthormy:session:${nonce}`, "1", "EX", String(8 * 60 * 60));
    } else {
      for (const [sessionId, session] of sessions) {
        if (session.expiresAt <= Math.floor(Date.now() / 1000)) sessions.delete(sessionId);
      }
      sessions.set(nonce, { expiresAt });
    }
    const secure = isVercelDeployment
      || request.socket.encrypted
      || request.headers["x-forwarded-proto"] === "https";
    sendJson(response, 200, { authenticated: true }, {
      "Set-Cookie": `thunder_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure ? "; Secure" : ""}`,
    });
    return true;
  }

  if (url.pathname === "/api/logout" && request.method === "POST") {
    const token = getSessionToken(request);
    if (token) {
      if (isVercelDeployment && hasRedisConfig()) {
        await redisCommand("DEL", `thunder-sthormy:session:${token.nonce}`);
      } else {
        sessions.delete(token.nonce);
      }
    }
    sendJson(response, 200, { authenticated: false }, {
      "Set-Cookie": `thunder_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${isVercelDeployment ? "; Secure" : ""}`,
    });
    return true;
  }

  if (url.pathname === "/api/images" && request.method === "POST") {
    if (!await requireAdmin(request, response)) return true;
    const body = await readJson(request, maxImageRequestBytes);
    const mimeType = cleanText(body.mimeType, 30);
    const extension = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[mimeType];
    if (!extension || typeof body.data !== "string" || body.data.length > Math.ceil(maxImageBytes * 4 / 3) + 8) {
      sendJson(response, 400, { error: "Formato de imagem inválido. Use JPG, PNG ou WEBP." });
      return true;
    }
    const image = Buffer.from(body.data, "base64");
    if (!image.length || image.length > maxImageBytes || !imageHasValidSignature(image, mimeType)) {
      sendJson(response, 400, { error: "A imagem é inválida ou excede 2 MB." });
      return true;
    }
    const filename = `${crypto.randomUUID()}${extension}`;
    if (isVercelDeployment) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        sendJson(response, 503, { error: "Configure o armazenamento Vercel Blob para enviar fotos." });
        return true;
      }
      const blob = await put(`products/${filename}`, image, {
        access: "public",
        addRandomSuffix: false,
        contentType: mimeType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      sendJson(response, 201, { path: blob.url });
      return true;
    }
    await fs.writeFile(path.join(uploadsRoot, filename), image, { flag: "wx" });
    sendJson(response, 201, { path: `/uploads/${filename}` });
    return true;
  }

  const productRoute = url.pathname.match(/^\/api\/products(?:\/([a-f0-9-]+))?$/);
  if (!productRoute) return false;
  const productId = productRoute[1];

  if (request.method === "GET" && !productId) {
    const products = await loadProducts();
    const visibleProducts = await getSession(request) ? products : products.filter((product) => product.active !== false);
    sendJson(response, 200, visibleProducts);
    return true;
  }

  if (request.method === "POST" && !productId) {
    if (!await requireAdmin(request, response)) return true;
    const product = normalizeProduct(await readJson(request, 64 * 1024));
    const products = await loadProducts();
    const savedProduct = { id: crypto.randomUUID(), ...product, createdAt: new Date().toISOString() };
    products.push(savedProduct);
    await saveProducts(products);
    sendJson(response, 201, savedProduct);
    return true;
  }

  if (request.method === "PUT" && productId) {
    if (!await requireAdmin(request, response)) return true;
    const product = normalizeProduct(await readJson(request, 64 * 1024));
    const products = await loadProducts();
    const index = products.findIndex((entry) => entry.id === productId);
    if (index < 0) {
      sendJson(response, 404, { error: "Peça não encontrada." });
      return true;
    }
    products[index] = { ...products[index], ...product, updatedAt: new Date().toISOString() };
    await saveProducts(products);
    sendJson(response, 200, products[index]);
    return true;
  }

  if (request.method === "DELETE" && productId) {
    if (!await requireAdmin(request, response)) return true;
    const products = await loadProducts();
    const updatedProducts = products.filter((product) => product.id !== productId);
    if (updatedProducts.length === products.length) {
      sendJson(response, 404, { error: "Peça não encontrada." });
      return true;
    }
    await saveProducts(updatedProducts);
    sendJson(response, 200, { deleted: true });
    return true;
  }

  sendJson(response, 405, { error: "Método não permitido." }, { Allow: "GET, POST, PUT, DELETE" });
  return true;
}

async function serveStatic(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Método não permitido." }, { Allow: "GET, HEAD" });
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: "Endereço inválido." });
    return;
  }
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(publicRoot, relativePath);
  if (!filePath.startsWith(`${publicRoot}${path.sep}`)) {
    sendJson(response, 403, { error: "Acesso negado." });
    return;
  }

  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      sendJson(response, 404, { error: "Arquivo não encontrado." });
      return;
    }
    const contents = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=86400",
      "Content-Length": contents.length,
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "Arquivo não encontrado." });
      return;
    }
    throw error;
  }
}

async function handleRequest(request, response) {
  try {
    response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' https://*.public.blob.vercel-storage.com data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (isVercelDeployment) response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      if (["POST", "PUT", "DELETE"].includes(request.method) && !hasTrustedOrigin(request)) {
        sendJson(response, 403, { error: "Origem da solicitação não permitida." });
        return;
      }
      const handled = await handleApi(request, response, url);
      if (!handled) sendJson(response, 404, { error: "Rota não encontrada." });
      return;
    }
    await serveStatic(request, response, url.pathname);
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status === 500) console.error(error);
    sendJson(response, status, { error: status === 500 ? "Erro interno do servidor." : error.message });
  }
}

async function start() {
  await fs.mkdir(uploadsRoot, { recursive: true });
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.access(productsFile);
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`Catálogo Thunder Sthormy disponível em http://localhost:${port}`);
    const configuration = getAdminConfiguration();
    if (!configuration.enabled) {
      console.warn(`Configure para habilitar a área da loja: ${configuration.missing.join("; ")}.`);
    }
  });
  return server;
}

function hasTrustedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return !isVercelDeployment;
  try {
    const parsedOrigin = new URL(origin);
    const forwardedHost = request.headers["x-forwarded-host"] || request.headers.host || "";
    const forwardedProtocol = request.headers["x-forwarded-proto"] || (isVercelDeployment ? "https" : "http");
    const expectedHost = forwardedHost.split(",")[0].trim().toLowerCase();
    const expectedProtocol = forwardedProtocol.split(",")[0].trim().toLowerCase();
    return parsedOrigin.host.toLowerCase() === expectedHost
      && parsedOrigin.protocol === `${expectedProtocol}:`;
  } catch {
    return false;
  }
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Não foi possível iniciar o catálogo:", error);
    process.exitCode = 1;
  });
}

module.exports = { handleRequest, start };
