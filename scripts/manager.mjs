import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { promises as fs, openSync, closeSync, writeSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import dgram from "node:dgram";
import { defaultConfig, validateConfig } from "../shared/config.mjs";
import { resolveAllowedCars } from "../shared/cars.mjs";

export const dataDir = path.resolve(process.env.ACE_DATA_DIR || "./data");
const serverDir = path.resolve(process.env.ACE_SERVER_DIR || "/server");
const socketPath = path.join(dataDir, "control.sock");
const configPath = path.join(dataDir, "configuration.json");
let child = null;
let state = "stopped";
let startedAt = null;
let lastExit = null;
let activeConfig = null;
let busy = false;
let logs = [];
let diskLog;
let secrets = [];
let diskBytes = 0;
let startupTimer;

export async function catalog() {
  const read = async (name) =>
    JSON.parse(await fs.readFile(path.join(serverDir, name), "utf8"));
  const [cars, practice, race] = await Promise.all([
    read("cars.json"),
    read("events_practice.json"),
    read("events_race_weekend.json"),
  ]);
  return { cars: cars.cars, practice: practice.events, race: race.events };
}

function redact(text) {
  for (const secret of secrets)
    if (secret) text = text.split(secret).join("[redacted]");
  return text.replace(
    /("(?:driver_password|spectator_password|admin_password|token)"\s*:\s*)".*?"/g,
    '$1"[redacted]"',
  );
}

function log(text) {
  const line = redact(String(text)).replace(/\r/g, "");
  logs.push(line);
  while (
    logs.length > 2000 ||
    logs.reduce((size, line) => size + line.length, 0) > 2 * 1024 * 1024
  )
    logs.shift();
  // Bound disk output as well as the live view for long-running servers.
  if (diskLog !== undefined && diskBytes < 10 * 1024 * 1024) {
    try {
      diskBytes += writeSync(diskLog, line);
    } catch {
      /* log view stays available */
    }
  }
}

export async function readConfig() {
  try {
    return JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const config = defaultConfig();
    await fs.mkdir(dataDir, { recursive: true });
    await fs
      .writeFile(configPath, JSON.stringify(config, null, 2), {
        mode: 0o600,
        flag: "wx",
      })
      .catch((error) => {
        if (error.code !== "EEXIST") throw error;
      });
    return JSON.parse(await fs.readFile(configPath, "utf8"));
  }
}

async function saveConfig(config) {
  validateConfig(config, await catalog());
  await fs.mkdir(path.join(dataDir, "backups"), { recursive: true });
  await fs.copyFile(
    configPath,
    path.join(dataDir, "backups", `${Date.now()}.json`),
  );
  const tmp = `${configPath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
  await fs.rename(tmp, configPath);
  const backups = (await fs.readdir(path.join(dataDir, "backups")))
    .sort()
    .reverse();
  for (const file of backups.slice(10))
    await fs.unlink(path.join(dataDir, "backups", file));
  return { saved: true, restartRequired: child !== null };
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function checkPorts(config) {
  for (const port of [
    config.server.server_tcp_internal_port,
    config.server.server_http_port,
  ]) {
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", () =>
        reject(new Error(`TCP port ${port} is already in use`)),
      );
      probe.listen(port, "0.0.0.0", () => probe.close(resolve));
    });
  }
  await new Promise((resolve, reject) => {
    const probe = dgram.createSocket("udp4");
    probe.once("error", () => {
      probe.close();
      reject(
        new Error(
          `UDP port ${config.server.server_udp_internal_port} is already in use`,
        ),
      );
    });
    probe.bind(config.server.server_udp_internal_port, "0.0.0.0", () =>
      probe.close(resolve),
    );
  });
}

async function status() {
  const config = await readConfig();
  if (child && state !== "stopping") {
    const current = child;
    const ready = await portOpen(activeConfig.server.server_tcp_internal_port);
    if (child === current && state !== "stopping")
      state = ready ? "running" : "starting";
  }
  return {
    state,
    pid: child?.pid ?? null,
    startedAt,
    lastExit,
    pendingChanges:
      !!activeConfig && JSON.stringify(activeConfig) !== JSON.stringify(config),
    serverName: (activeConfig || config).server.server_name,
    track: (activeConfig || config).event.event,
    ports: {
      game: (activeConfig || config).server.server_tcp_internal_port,
      tcp: (activeConfig || config).server.server_tcp_internal_port,
      udp: (activeConfig || config).server.server_udp_internal_port,
      http: (activeConfig || config).server.server_http_port,
    },
    registerLobby: (activeConfig || config).runtime.registerLobby,
    installed: await fs
      .access(path.join(serverDir, "AssettoCorsaEVOServer.exe"))
      .then(
        () => true,
        () => false,
      ),
  };
}

async function start() {
  if (child) return status();
  const installed = await catalog();
  const config = validateConfig(await readConfig(), installed);
  await fs.access(path.join(serverDir, "AssettoCorsaEVOServer.exe"));
  await checkPorts(config);
  const runDir = path.join(dataDir, "run");
  const resultsDir = path.join(dataDir, "results");
  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(resultsDir, { recursive: true });
  const windowsPath = (file) => `Z:${file.replaceAll("/", "\\")}`;
  const server = {
    ...config.server,
    allowed_cars_list_full: resolveAllowedCars(config, installed),
    results_path: windowsPath(resultsDir),
    entry_list_path: "",
  };
  const entryList = path.join(dataDir, "entry-list.json");
  if (
    await fs.access(entryList).then(
      () => true,
      () => false,
    )
  )
    server.entry_list_path = windowsPath(entryList);
  await fs.writeFile(path.join(runDir, "server.json"), JSON.stringify(server), {
    mode: 0o600,
  });
  await fs.writeFile(
    path.join(runDir, "event.json"),
    JSON.stringify(config.event),
    { mode: 0o600 },
  );
  if (diskLog !== undefined) closeSync(diskLog);
  diskLog = openSync(path.join(dataDir, "server.log"), "w", 0o600);
  diskBytes = 0;
  secrets = [
    server.driver_password,
    server.spectator_password,
    server.admin_password,
    server.token,
  ].filter(Boolean);
  logs = [];
  log(`[manager] Starting ${server.server_name}\n`);
  const args = [
    path.join(serverDir, "AssettoCorsaEVOServer.exe"),
    "-configjson",
    windowsPath(path.join(runDir, "server.json")),
    "-seasonjson",
    windowsPath(path.join(runDir, "event.json")),
    "-write_server_results",
  ];
  if (!config.runtime.registerLobby) args.push("-no_lobby");
  const emulation = config.runtime.cpuEmulation === true;
  const wine =
    process.env.ACE_WINE_BIN || (emulation ? "/usr/lib/wine/wine64" : "wine");
  const command = emulation
    ? process.env.ACE_QEMU_BIN || "/usr/bin/qemu-x86_64"
    : wine;
  const launchArgs = emulation ? ["-cpu", "max", wine, ...args] : args;
  if (emulation) log("[manager] CPU emulation enabled (QEMU)\n");
  // No shell interpolation, no broad process-name kills. Each instance owns its process group and Wine prefix.
  const proc = spawn(command, launchArgs, {
    cwd: serverDir,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      WINEPREFIX: path.join(dataDir, "wine"),
      WINEARCH: "win64",
      WINEDEBUG: process.env.WINEDEBUG || "-all",
      WINEDLLOVERRIDES: "mscoree,mshtml=;winemenubuilder.exe=d",
      // Keep Wine's loader inside QEMU instead of re-executing it natively.
      ...(emulation ? { WINELOADERNOEXEC: "1" } : {}),
    },
  });
  child = proc;
  activeConfig = structuredClone(config);
  state = "starting";
  startedAt = new Date().toISOString();
  lastExit = null;
  const capture = (stream) => {
    stream.setEncoding("utf8");
    let pending = "";
    stream.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) log(line + "\n");
      if (pending.length > 65536) {
        log("[manager] Truncated oversized log line\n");
        pending = "";
      }
    });
    stream.on("end", () => {
      if (pending) log(pending + "\n");
    });
  };
  capture(proc.stdout);
  capture(proc.stderr);
  proc.once("error", (error) => {
    clearTimeout(startupTimer);
    log(`[manager] Launch failed: ${error.message}\n`);
    lastExit = { error: error.message, at: new Date().toISOString() };
    if (child === proc) {
      child = null;
      state = "failed";
      activeConfig = null;
    }
  });
  proc.once("exit", (code, signal) => {
    clearTimeout(startupTimer);
    const stopped = state === "stopping";
    log(`[manager] Server exited (${code ?? signal})\n`);
    lastExit = { code, signal, at: new Date().toISOString() };
    if (child === proc) {
      child = null;
      state = stopped || code === 0 ? "stopped" : "failed";
      activeConfig = null;
    }
  });
  const startupSeconds = emulation ? 180 : 90;
  startupTimer = setTimeout(async () => {
    if (
      child === proc &&
      !(await portOpen(config.server.server_tcp_internal_port))
    ) {
      log(`[manager] Startup timed out after ${startupSeconds} seconds\n`);
      await stop();
      state = "failed";
      lastExit = {
        error: `Startup timed out after ${startupSeconds} seconds`,
        at: new Date().toISOString(),
      };
    }
  }, startupSeconds * 1000);
  startupTimer.unref();
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (state === "failed")
    throw new Error(
      lastExit?.error || "Server exited during startup; see logs",
    );
  return status();
}

async function stop() {
  if (!child) return status();
  state = "stopping";
  clearTimeout(startupTimer);
  const proc = child;
  const exited = new Promise((resolve) => proc.once("exit", resolve));
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  let timer;
  await Promise.race([
    exited,
    new Promise((resolve) => {
      timer = setTimeout(resolve, 5000);
    }),
  ]);
  clearTimeout(timer);
  // Kill remaining Wine processes from this group even if the loader has exited.
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  if (child === proc) {
    child = null;
    activeConfig = null;
    state = "stopped";
  }
  return status();
}

async function body(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw new Error("Request exceeds 1 MiB");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON");
  }
}

async function results() {
  const dir = path.join(dataDir, "results");
  await fs.mkdir(dir, { recursive: true });
  const files = (await fs.readdir(dir, { withFileTypes: true })).filter(
    (f) => f.isFile() && f.name.endsWith(".json"),
  );
  return Promise.all(
    files.map(async (f) => {
      const stat = await fs.stat(path.join(dir, f.name));
      return {
        name: f.name,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      };
    }),
  );
}

export async function createManager() {
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  await readConfig();
  // Never steal a socket from another live manager.
  if (
    await fs.access(socketPath).then(
      () => true,
      () => false,
    )
  ) {
    const live = await new Promise((resolve) => {
      const s = net.connect(socketPath);
      s.once("connect", () => {
        s.destroy();
        resolve(true);
      });
      s.once("error", () => resolve(false));
    });
    if (live) throw new Error("Another manager is already using ACE_DATA_DIR");
    await fs.unlink(socketPath);
  }
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    const url = new URL(req.url, "http://localhost");
    try {
      let result;
      if (req.method === "GET") {
        if (url.pathname === "/status") result = await status();
        else if (url.pathname === "/config") result = await readConfig();
        else if (url.pathname === "/catalog") result = await catalog();
        else if (url.pathname === "/logs") result = { text: logs.join("") };
        else if (url.pathname === "/results") result = await results();
        else if (url.pathname === "/entry-list")
          result = await fs
            .readFile(path.join(dataDir, "entry-list.json"), "utf8")
            .then(JSON.parse, (error) => {
              if (error.code === "ENOENT") return null;
              throw error;
            });
        else if (url.pathname === "/results/download") {
          const name = url.searchParams.get("name");
          if (!name || path.basename(name) !== name || !name.endsWith(".json"))
            throw new Error("Invalid result filename");
          const target = path.join(dataDir, "results", name);
          const stat = await fs.lstat(target);
          if (!stat.isFile() || stat.size > 20 * 1024 * 1024)
            throw new Error("Invalid result file or file exceeds 20 MiB");
          result = JSON.parse(await fs.readFile(target, "utf8"));
        } else {
          res.statusCode = 404;
          result = { error: "Not found" };
        }
      } else if (req.method === "POST") {
        if (busy) {
          res.statusCode = 409;
          res.end(
            JSON.stringify({ error: "Another operation is in progress" }),
          );
          return;
        }
        busy = true;
        try {
          if (url.pathname === "/config")
            result = await saveConfig(await body(req));
          else if (url.pathname === "/start") result = await start();
          else if (url.pathname === "/stop") result = await stop();
          else if (url.pathname === "/restart") {
            await stop();
            result = await start();
          } else if (url.pathname === "/entry-list") {
            const data = await body(req);
            const file = path.join(dataDir, "entry-list.json");
            if (data === null) await fs.rm(file, { force: true });
            else {
              if (!data || typeof data !== "object" || Array.isArray(data))
                throw new Error(
                  "Entry list must be a JSON object, or null to disable",
                );
              await fs.writeFile(`${file}.tmp`, JSON.stringify(data, null, 2), {
                mode: 0o600,
              });
              await fs.rename(`${file}.tmp`, file);
            }
            result = { saved: true, restartRequired: !!child };
          } else {
            res.statusCode = 404;
            result = { error: "Not found" };
          }
        } finally {
          busy = false;
        }
      } else {
        res.statusCode = 405;
        result = { error: "Method not allowed" };
      }
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  await fs.chmod(socketPath, 0o600);
  if (process.env.ACE_AUTO_START === "true") {
    busy = true;
    await start()
      .catch((error) => {
        state = "failed";
        log(`[manager] ${error.message}\n`);
      })
      .finally(() => {
        busy = false;
      });
  }
  return async () => {
    await stop();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(socketPath, { force: true });
    if (diskLog !== undefined) {
      closeSync(diskLog);
      diskLog = undefined;
    }
  };
}
