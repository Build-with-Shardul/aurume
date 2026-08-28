import { redirect } from "next/navigation";
import { getSession, hasUsers } from "@/lib/auth-server";

export default async function Home() {
  if (!(await hasUsers())) redirect("/setup");
  const session = await getSession();
  if (!session) redirect("/login");
  redirect("/projects");
}
