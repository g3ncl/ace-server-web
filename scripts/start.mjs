import { spawn } from "node:child_process";
import path from "node:path";
import { createManager, dataDir } from "./manager.mjs";

const dev = process.argv.includes("--dev");
const webHost = process.env.ACE_WEB_HOST || "127.0.0.1";
process.env.ACE_DATA_DIR = dataDir;
const closeManager = await createManager();
const web = spawn(
  process.execPath,
  dev
    ? [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        webHost,
      ]
    : [process.env.ACE_NEXT_SERVER || ".next/standalone/server.js"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      HOSTNAME: webHost,
      PORT: process.env.PORT || "3000",
      ACE_DATA_DIR: path.resolve(dataDir),
    },
  },
);
let closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  web.kill("SIGTERM");
  const timeout = setTimeout(() => {
    web.kill("SIGKILL");
    process.exit(1);
  }, 12000);
  await closeManager();
  clearTimeout(timeout);
  process.exit(code);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
web.once("exit", (code) => void shutdown(code || 0));
web.once("error", (error) => {
  console.error(error.message);
  void shutdown(1);
});
