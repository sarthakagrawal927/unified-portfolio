import { metadata } from "../../../server/oauth";
export async function GET() {
  return Response.json(metadata());
}
