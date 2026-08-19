import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { store } from "@/lib/store";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  try {
    const notifications = await store.listNotifications(auth.userId);
    return ok({ notifications });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const { id } = body || {};
  if (id) {
    await store.markNotificationRead(auth.userId, String(id));
    return ok({ ok: true });
  }

  await store.markAllNotificationsRead(auth.userId);
  return ok({ ok: true });
}