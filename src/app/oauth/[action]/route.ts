import { oauth } from "../../../server/oauth";
import { rateLimit } from "../../../db/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ action: string }> },
) {
  try {
    if (Number(req.headers.get("content-length") || 0) > 16384)
      return new Response("Request too large", { status: 413 });
    const { action } = await ctx.params;
    if (
      !(await rateLimit("oauth:" + action, action === "register" ? 5 : 60, 60))
    )
      return new Response("Rate limited", { status: 429 });
    return await oauth(req, action);
  } catch {
    return Response.json(
      { error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const GET = POST;
