import { api } from "../../../server/routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return api(req, (await ctx.params).path);
}
export const GET = POST;
