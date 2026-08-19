import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-helpers";
import { syncUserInbox } from "@/lib/gmail/sync";

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  try {
    const count = await syncUserInbox(auth.userId);
    return NextResponse.json({ synced: count });
  } catch (e) {
    console.error("Sync error", e);
    return NextResponse.json({ error: "No se pudo sincronizar Gmail" }, { status: 500 });
  }
}