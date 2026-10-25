import http from "node:http";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const routes = new Set([
  "status",
  "config",
  "catalog",
  "logs",
  "results",
  "results/download",
  "entry-list",
  "start",
  "stop",
  "restart",
]);

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const name = (await context.params).path.join("/");
  if (!routes.has(name))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin) {
      let valid = false;
      try {
        valid = new URL(origin).host === request.headers.get("host");
      } catch {
        /* invalid origin */
      }
      if (!valid)
        return NextResponse.json(
          { error: "Cross-origin changes are not allowed" },
          { status: 403 },
        );
    }
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return NextResponse.json(
        { error: "Use application/json" },
        { status: 415 },
      );
    if (Number(request.headers.get("content-length")) > 1024 * 1024)
      return NextResponse.json(
        { error: "Request exceeds 1 MiB" },
        { status: 413 },
      );
  }
  try {
    let body = "";
    if (request.method === "POST" && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024 * 1024) {
          await reader.cancel();
          return NextResponse.json(
            { error: "Request exceeds 1 MiB" },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
      body = Buffer.concat(chunks).toString("utf8");
    }
    const result = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const req = http.request(
          {
            socketPath: path.join(
              path.resolve(process.env.ACE_DATA_DIR || "./data"),
              "control.sock",
            ),
            path: `/${name}${request.nextUrl.search}`,
            method: request.method,
            headers: { "Content-Type": "application/json" },
          },
          (res) => {
            let data = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => {
              data += chunk;
            });
            res.on("end", () =>
              resolve({ status: res.statusCode || 500, body: data }),
            );
          },
        );
        req.setTimeout(15000, () =>
          req.destroy(new Error("Manager timed out")),
        );
        req.on("error", reject);
        req.end(body);
      },
    );
    return new NextResponse(result.body, {
      status: result.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Server manager unavailable. Start the application with npm run dev or npm start.",
      },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
