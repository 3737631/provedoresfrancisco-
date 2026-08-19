import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("responses")
    .select("*, suppliers(company, product_name)")
    .eq("user_id", user.id)
    .order("received_at", { ascending: false })
    .limit(100);
  if (error) return fail(error.message, 500);
  return ok({ responses: data || [] });
}