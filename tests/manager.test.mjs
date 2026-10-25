import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";

test("manager lifecycle, persistence, validation, redaction and safe result downloads", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ace-test-"));
  const serverDir = path.join(root, "server");
  const dataDir = path.join(root, "data");
  await fs.mkdir(serverDir);
  const track = {
    track: "Brands Hatch",
    layout: "GP",
    event_name: "GP Time Attack",
    track_length: 3916,
    max_pit_slot: 32,
  };
  await fs.writeFile(
    path.join(serverDir, "cars.json"),
    JSON.stringify({
      cars: [{ name: "preset_695b_mech_1" }, { name: "another_car" }],
    }),
  );
  await fs.writeFile(
    path.join(serverDir, "events_practice.json"),
    JSON.stringify({ events: [track] }),
  );
  await fs.writeFile(
    path.join(serverDir, "events_race_weekend.json"),
    JSON.stringify({ events: [{ ...track, event_name: "GP Race" }] }),
  );
  await fs.writeFile(path.join(serverDir, "AssettoCorsaEVOServer.exe"), "");
  const fake = path.join(root, "fake-wine");
  await fs.writeFile(
    fake,
    `#!/usr/bin/env node
const fs = require('fs'), net = require('net');
const name = process.argv[process.argv.indexOf('-configjson') + 1].slice(2).replaceAll('\\\\', '/');
const config = JSON.parse(fs.readFileSync(name));
if (config.server_name === 'FAIL') process.exit(12);
process.stdout.write('driver password: ' + config.driver_password.slice(0, 4));
setTimeout(() => console.log(config.driver_password.slice(4)), 20);
const server = net.createServer(s => s.end());
server.listen(config.server_tcp_internal_port, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
`,
    { mode: 0o700 },
  );
  const fakeQemu = path.join(root, "fake-qemu");
  const qemuLaunch = path.join(root, "qemu-launch.json");
  await fs.writeFile(
    fakeQemu,
    `#!/usr/bin/env node
const fs = require('fs'), { spawn } = require('child_process');
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(qemuLaunch)}, JSON.stringify({
  args, loaderNoExec: process.env.WINELOADERNOEXEC, prefix: process.env.WINEPREFIX
}));
const child = spawn(args[2], args.slice(3), { stdio: 'inherit' });
process.on('SIGTERM', () => {});
child.on('exit', code => process.exit(code ?? 1));
`,
    { mode: 0o700 },
  );
  process.env.ACE_DATA_DIR = dataDir;
  process.env.ACE_SERVER_DIR = serverDir;
  process.env.ACE_WINE_BIN = fake;
  process.env.ACE_QEMU_BIN = fakeQemu;
  const { createManager } = await import("../scripts/manager.mjs");
  const close = await createManager();
  const call = (route, data) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          socketPath: path.join(dataDir, "control.sock"),
          path: `/${route}`,
          method: data === undefined ? "GET" : "POST",
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () =>
            resolve({ status: res.statusCode, data: JSON.parse(body) }),
          );
        },
      );
      req.on("error", reject);
      req.end(data === undefined ? undefined : JSON.stringify(data));
    });
  const freePort = () =>
    new Promise((resolve) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const port = s.address().port;
        s.close(() => resolve(port));
      });
    });
  async function waitForState(state) {
    for (let i = 0; i < 50; i++) {
      const result = await call("status");
      if (result.data.state === state) return result.data;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail(
      `Server did not reach ${state}: ${JSON.stringify((await call("logs")).data)}`,
    );
  }
  try {
    const config = (await call("config")).data;
    assert.equal(config.runtime.cpuEmulation, false);
    const port = await freePort();
    for (const key of [
      "server_tcp_listener_port",
      "server_udp_listener_port",
      "server_tcp_internal_port",
      "server_udp_internal_port",
    ])
      config.server[key] = port;
    config.server.server_http_port = await freePort();
    config.server.driver_password = "secret-test-password";
    assert.equal((await call("config", config)).status, 200);
    assert.equal((await call("start", {})).status, 200);
    await waitForState("running");
    const firstPid = (await call("status")).data.pid;
    assert.equal(
      (await call("start", {})).data.pid,
      firstPid,
      "duplicate starts are idempotent",
    );
    const output = (await call("logs")).data.text;
    assert.ok(output.includes("[redacted]"));
    assert.ok(!output.includes("secret-test-password"));
    config.server.server_name = "Updated";
    assert.equal((await call("config", config)).data.restartRequired, true);
    assert.equal((await call("status")).data.pendingChanges, true);
    const before = await fs.readFile(
      path.join(dataDir, "configuration.json"),
      "utf8",
    );
    assert.equal((await call("config", { ...config, version: 2 })).status, 400);
    assert.equal(
      await fs.readFile(path.join(dataDir, "configuration.json"), "utf8"),
      before,
    );
    assert.equal((await call("restart", {})).status, 200);
    await waitForState("running");
    assert.notEqual((await call("status")).data.pid, firstPid);
    assert.equal((await call("status")).data.pendingChanges, false);
    const previousPort = config.server.server_tcp_internal_port;
    const changedPort = await freePort();
    const changedHttpPort = await freePort();
    let changedUdpPort = await freePort();
    while (changedUdpPort === changedPort) changedUdpPort = await freePort();
    for (const key of [
      "server_tcp_listener_port",
      "server_udp_listener_port",
      "server_tcp_internal_port",
      "server_udp_internal_port",
    ])
      config.server[key] = changedPort;
    config.server.server_http_port = changedHttpPort;
    config.server.server_udp_listener_port = changedUdpPort;
    config.server.server_udp_internal_port = changedUdpPort;
    await call("config", config);
    assert.equal(
      (await call("status")).data.ports.game,
      previousPort,
      "saving does not move a running listener",
    );
    assert.equal((await call("status")).data.pendingChanges, true);
    await call("restart", {});
    const moved = await waitForState("running");
    assert.equal(moved.ports.game, changedPort);
    assert.equal(moved.ports.tcp, changedPort);
    assert.equal(moved.ports.udp, changedUdpPort);
    assert.equal(moved.ports.http, changedHttpPort);
    assert.equal(moved.pendingChanges, false);
    const stillOpen = await new Promise((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port: previousPort });
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
    assert.equal(stillOpen, false, "restart releases the previous game port");
    assert.equal((await call("entry-list", { drivers: [] })).status, 200);
    assert.deepEqual((await call("entry-list")).data, { drivers: [] });
    assert.equal((await call("entry-list", null)).status, 200);
    assert.equal((await call("entry-list")).data, null);
    await fs.writeFile(
      path.join(dataDir, "results", "session.json"),
      '{"finished":true}',
    );
    assert.equal((await call("results")).data.length, 1);
    assert.deepEqual((await call("results/download?name=session.json")).data, {
      finished: true,
    });
    assert.equal(
      (await call("results/download?name=..%2Fconfiguration.json")).status,
      400,
    );
    await fs.symlink(
      path.join(dataDir, "configuration.json"),
      path.join(dataDir, "results", "secret.json"),
    );
    assert.equal((await call("results/download?name=secret.json")).status, 400);
    assert.equal((await call("stop", {})).data.state, "stopped");
    config.runtime.carSelection = "all";
    config.server.allowed_cars_list_full = [
      { car_name: "preset_695b_mech_1", ballast: 25, restrictor: 0.05 },
    ];
    await call("config", config);
    await call("start", {});
    await waitForState("running");
    let native = JSON.parse(
      await fs.readFile(path.join(dataDir, "run", "server.json"), "utf8"),
    );
    assert.equal(native.allowed_cars_list_full.length, 2);
    assert.equal(
      native.allowed_cars_list_full.find(
        (car) => car.car_name === "preset_695b_mech_1",
      ).ballast,
      25,
    );
    assert.equal(
      (await call("config")).data.server.allowed_cars_list_full.length,
      1,
      "saved config keeps sparse overrides",
    );
    await fs.writeFile(
      path.join(serverDir, "cars.json"),
      JSON.stringify({
        cars: [
          { name: "preset_695b_mech_1" },
          { name: "another_car" },
          { name: "new_car" },
        ],
      }),
    );
    await call("restart", {});
    await waitForState("running");
    native = JSON.parse(
      await fs.readFile(path.join(dataDir, "run", "server.json"), "utf8"),
    );
    assert.equal(
      native.allowed_cars_list_full.length,
      3,
      "restart reloads new catalog cars",
    );
    config.runtime.cpuEmulation = true;
    assert.equal((await call("config", config)).data.restartRequired, true);
    assert.equal((await call("status")).data.pendingChanges, true);
    await assert.rejects(fs.access(qemuLaunch), { code: "ENOENT" });
    await call("restart", {});
    await waitForState("running");
    const launch = JSON.parse(await fs.readFile(qemuLaunch, "utf8"));
    assert.deepEqual(launch.args.slice(0, 3), ["-cpu", "max", fake]);
    assert.equal(launch.args[3], path.join(serverDir, "AssettoCorsaEVOServer.exe"));
    assert.equal(launch.loaderNoExec, "1");
    assert.equal(launch.prefix, path.join(dataDir, "wine"));
    assert.equal((await call("config")).data.runtime.cpuEmulation, true);
    assert.equal((await call("status")).data.pendingChanges, false);
    native = JSON.parse(
      await fs.readFile(path.join(dataDir, "run", "server.json"), "utf8"),
    );
    assert.ok(!("cpuEmulation" in native), "emulation is not an EVO server setting");
    assert.ok((await call("logs")).data.text.includes("CPU emulation enabled"));
    await fs.unlink(qemuLaunch);
    config.runtime.cpuEmulation = false;
    await call("config", config);
    await call("restart", {});
    await waitForState("running");
    await assert.rejects(fs.access(qemuLaunch), { code: "ENOENT" });
    await call("stop", {});
    config.server.server_name = "FAIL";
    await call("config", config);
    await call("start", {});
    assert.equal((await waitForState("failed")).lastExit.code, 12);
    assert.ok((await fs.readdir(path.join(dataDir, "backups"))).length >= 2);
  } finally {
    await close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
