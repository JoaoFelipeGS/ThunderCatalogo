const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { once } = require("node:events");
const test = require("node:test");

const root = path.join(__dirname, "..");
const origin = "https://thunder-test.vercel.app";

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function getFreePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill();
  await exited;
}

async function startCatalog(environment) {
  const port = await getFreePort();
  const apiEntry = path.join(root, "api", "[...path].js");
  const runner = `const http=require("node:http");const handler=require(${JSON.stringify(apiEntry)});http.createServer((request,response)=>handler(request,response)).listen(Number(process.env.PORT),"127.0.0.1");`;
  const child = spawn(process.execPath, ["-e", runner], {
    cwd: root,
    env: { ...process.env, ...environment, PORT: String(port), VERCEL: "1" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`O catálogo parou ao iniciar: ${stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/config`);
      if (response.ok) return { child, baseUrl: `http://127.0.0.1:${port}` };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await stopChild(child);
  throw new Error(`O catálogo não iniciou a tempo: ${stderr}`);
}

function vercelHeaders(extra = {}) {
  return {
    Origin: origin,
    "X-Forwarded-Host": new URL(origin).host,
    "X-Forwarded-Proto": "https",
    ...extra,
  };
}

test("segurança, autenticação e persistência Vercel", async () => {
  const records = new Map();
  const redisServer = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const [operation, ...args] = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    let result = null;
    if (operation === "GET") result = records.get(args[0]) ?? null;
    if (operation === "SET") {
      if (args[2] !== "NX" || !records.has(args[0])) {
        records.set(args[0], args[1]);
        result = "OK";
      }
    }
    if (operation === "DEL") result = Number(records.delete(args[0]));
    if (operation === "EVAL") {
      const key = args[2];
      result = Number(records.get(key) || 0) + 1;
      records.set(key, String(result));
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ result }));
  });
  const redisPort = await listen(redisServer);
  let catalog;
  try {
    catalog = await startCatalog({
      ADMIN_PASSWORD: "uma-senha-forte-de-teste",
      ADMIN_SESSION_SECRET: "segredo-de-sessao-aleatorio-de-teste-123456789",
      KV_REST_API_URL: `http://127.0.0.1:${redisPort}`,
      KV_REST_API_TOKEN: "test-redis-token",
      WHATSAPP_NUMBER: "5514991107618",
    });

    const initialProducts = await fetch(`${catalog.baseUrl}/api/products`).then((response) => response.json());
    assert.equal(initialProducts.length, 24);
    assert.equal(records.has("thunder-sthormy:products:v1"), true);

    const sessionResponse = await fetch(`${catalog.baseUrl}/api/session`);
    const session = await sessionResponse.json();
    assert.equal(session.adminEnabled, true);
    assert.equal(session.authenticated, false);
    assert.equal(session.imageUploadsEnabled, false);
    assert.match(sessionResponse.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(sessionResponse.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");

    const wrongOrigin = await fetch(`${catalog.baseUrl}/api/login`, {
      method: "POST",
      headers: { ...vercelHeaders({ Origin: "https://attacker.example" }), "Content-Type": "application/json" },
      body: JSON.stringify({ password: "uma-senha-forte-de-teste" }),
    });
    assert.equal(wrongOrigin.status, 403);

    const login = await fetch(`${catalog.baseUrl}/api/login`, {
      method: "POST",
      headers: { ...vercelHeaders({ "X-Forwarded-For": "198.51.100.10" }), "Content-Type": "application/json" },
      body: JSON.stringify({ password: "uma-senha-forte-de-teste" }),
    });
    assert.equal(login.status, 200);
    const cookieHeader = login.headers.get("set-cookie");
    assert.match(cookieHeader, /HttpOnly/);
    assert.match(cookieHeader, /SameSite=Strict/);
    assert.match(cookieHeader, /Secure/);
    const cookie = cookieHeader.split(";")[0];

    const authenticated = await fetch(`${catalog.baseUrl}/api/session`, {
      headers: { Cookie: cookie },
    }).then((response) => response.json());
    assert.equal(authenticated.authenticated, true);

    const unauthorizedUpload = await fetch(`${catalog.baseUrl}/api/images`, {
      method: "POST",
      headers: { ...vercelHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType: "image/webp", data: "invalid" }),
    });
    assert.equal(unauthorizedUpload.status, 401);

    const externalImage = await fetch(`${catalog.baseUrl}/api/products`, {
      method: "POST",
      headers: { ...vercelHeaders({ Cookie: cookie }), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Imagem não confiável",
        description: "O endereço de imagem externo não é permitido.",
        category: "OVERSIZED",
        color: "Preto",
        sizes: ["M"],
        images: ["https://attacker.example/image.webp"],
        price: null,
        active: true,
      }),
    });
    assert.equal(externalImage.status, 400);

    const saved = await fetch(`${catalog.baseUrl}/api/products`, {
      method: "POST",
      headers: { ...vercelHeaders({ Cookie: cookie }), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Peça de teste",
        description: "Peça criada durante o teste automatizado.",
        category: "OVERSIZED",
        color: "Preto",
        sizes: ["M"],
        images: ["/assets/products/bermuda-boss-azul.webp"],
        price: null,
        active: true,
      }),
    });
    assert.equal(saved.status, 201);
    assert.equal(records.has("thunder-sthormy:products:v1"), true);
    const savedProduct = await saved.json();

    const edited = await fetch(`${catalog.baseUrl}/api/products/${savedProduct.id}`, {
      method: "PUT",
      headers: { ...vercelHeaders({ Cookie: cookie }), "Content-Type": "application/json" },
      body: JSON.stringify({
        ...savedProduct,
        title: "Peça editada",
        description: "Descrição atualizada pelo teste automatizado.",
        color: "Branco",
      }),
    });
    assert.equal(edited.status, 200);
    assert.equal((await edited.json()).title, "Peça editada");

    const deleted = await fetch(`${catalog.baseUrl}/api/products/${savedProduct.id}`, {
      method: "DELETE",
      headers: vercelHeaders({ Cookie: cookie }),
    });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { deleted: true });
    const productsAfterDelete = await fetch(`${catalog.baseUrl}/api/products`, {
      headers: { Cookie: cookie },
    }).then((response) => response.json());
    assert.equal(productsAfterDelete.some((product) => product.id === savedProduct.id), false);

    const unavailableImageUpload = await fetch(`${catalog.baseUrl}/api/images`, {
      method: "POST",
      headers: { ...vercelHeaders({ Cookie: cookie }), "Content-Type": "application/json" },
      body: JSON.stringify({
        mimeType: "image/webp",
        data: Buffer.from("RIFF0000WEBP").toString("base64"),
      }),
    });
    assert.equal(unavailableImageUpload.status, 503);

    const logout = await fetch(`${catalog.baseUrl}/api/logout`, {
      method: "POST",
      headers: vercelHeaders({ Cookie: cookie }),
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    const loggedOut = await fetch(`${catalog.baseUrl}/api/session`, {
      headers: { Cookie: cookie },
    }).then((response) => response.json());
    assert.equal(loggedOut.authenticated, false);

    const failedLoginAddress = "198.51.100.20";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failedLogin = await fetch(`${catalog.baseUrl}/api/login`, {
        method: "POST",
        headers: {
          ...vercelHeaders({ "X-Forwarded-For": failedLoginAddress }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: "senha-incorreta" }),
      });
      assert.equal(failedLogin.status, 401);
    }
    const rateLimited = await fetch(`${catalog.baseUrl}/api/login`, {
      method: "POST",
      headers: {
        ...vercelHeaders({ "X-Forwarded-For": failedLoginAddress }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: "senha-incorreta" }),
    });
    assert.equal(rateLimited.status, 429);

    await stopChild(catalog.child);
  } finally {
    if (catalog) await stopChild(catalog.child);
    await new Promise((resolve) => redisServer.close(resolve));
  }
});

test("o admin Vercel permanece fechado sem os segredos e os storages", async () => {
  const catalog = await startCatalog({
    ADMIN_PASSWORD: "uma-senha-forte-de-teste",
    ADMIN_SESSION_SECRET: "segredo-de-sessao-aleatorio-de-teste-123456789",
    UPSTASH_REDIS_REST_URL: "",
    UPSTASH_REDIS_REST_TOKEN: "",
    BLOB_READ_WRITE_TOKEN: "",
    WHATSAPP_NUMBER: "5514991107618",
  });
  try {
    const session = await fetch(`${catalog.baseUrl}/api/session`).then((response) => response.json());
    assert.equal(session.adminEnabled, false);
    assert.match(session.missing.join(" "), /UPSTASH_REDIS_REST_URL/);
    assert.equal(session.imageUploadsEnabled, false);

    const login = await fetch(`${catalog.baseUrl}/api/login`, {
      method: "POST",
      headers: { ...vercelHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ password: "uma-senha-forte-de-teste" }),
    });
    assert.equal(login.status, 503);
  } finally {
    await stopChild(catalog.child);
  }
});

test("falhas do Vercel Blob retornam erro de configuração sem 500 genérico", async () => {
  const records = new Map();
  const redisServer = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const [operation, ...args] = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    let result = null;
    if (operation === "GET") result = records.get(args[0]) ?? null;
    if (operation === "SET") {
      if (args[2] !== "NX" || !records.has(args[0])) {
        records.set(args[0], args[1]);
        result = "OK";
      }
    }
    if (operation === "DEL") result = Number(records.delete(args[0]));
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ result }));
  });
  const blobServer = http.createServer((_request, response) => {
    response.writeHead(403, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { code: "forbidden" } }));
  });
  const redisPort = await listen(redisServer);
  const blobPort = await listen(blobServer);
  let catalog;
  try {
    catalog = await startCatalog({
      ADMIN_PASSWORD: "uma-senha-forte-de-teste",
      ADMIN_SESSION_SECRET: "segredo-de-sessao-aleatorio-de-teste-123456789",
      BLOB_READ_WRITE_TOKEN: "test-blob-token",
      KV_REST_API_URL: `http://127.0.0.1:${redisPort}`,
      KV_REST_API_TOKEN: "test-redis-token",
      VERCEL_BLOB_API_URL: `http://localhost:${blobPort}`,
      VERCEL_BLOB_RETRIES: "0",
      WHATSAPP_NUMBER: "5514991107618",
    });

    const login = await fetch(`${catalog.baseUrl}/api/login`, {
      method: "POST",
      headers: { ...vercelHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ password: "uma-senha-forte-de-teste" }),
    });
    assert.equal(login.status, 200);

    const upload = await fetch(`${catalog.baseUrl}/api/images`, {
      method: "POST",
      headers: {
        ...vercelHeaders({ Cookie: login.headers.get("set-cookie").split(";")[0] }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mimeType: "image/webp",
        data: Buffer.from("RIFF0000WEBP").toString("base64"),
      }),
    });
    assert.equal(upload.status, 502);
    const uploadResult = await upload.json();
    assert.match(uploadResult.error, /Blob recusou o token/);
    assert.doesNotMatch(uploadResult.error, /test-blob-token/);
  } finally {
    if (catalog) await stopChild(catalog.child);
    await new Promise((resolve) => redisServer.close(resolve));
    await new Promise((resolve) => blobServer.close(resolve));
  }
});
