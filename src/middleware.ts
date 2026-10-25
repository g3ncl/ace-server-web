import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const password = process.env.ACE_WEB_PASSWORD;
  if (!password) return NextResponse.next();
  let credentials = "";
  try {
    const auth = request.headers.get("authorization");
    if (auth?.startsWith("Basic ")) credentials = atob(auth.slice(6));
  } catch {
    /* require authentication */
  }
  const expected = `${process.env.ACE_WEB_USER || "admin"}:${password}`;
  let diff = credentials.length ^ expected.length;
  for (let i = 0; i < expected.length; i++)
    diff |= (credentials.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  if (diff === 0) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="ACE Server Web", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
