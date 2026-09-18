import { redirect } from "next/navigation";
import { sessionIdentity } from "./auth";
import { withUser } from "./tenant";
import { data } from "./data";
export async function view() {
  const session = await sessionIdentity();
  if (!session) redirect("/settings");
  return withUser(session.userId, () => data());
}
