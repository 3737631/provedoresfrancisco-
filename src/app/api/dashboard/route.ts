import { ok, fail, requireUser } from "@/lib/api-helpers";
import { store } from "@/lib/store";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  try {
    const stats = await store.getStats(auth.userId);
    return ok(stats);
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}