import { NextRequest, NextResponse } from "next/server";
import { syncAllUsers } from "@/lib/gmail/sync";

// Webhook de notificaciones push de Gmail (Pub/Sub).
// El token secreto lo envia Gmail en el body; aqui no se valida
// el emisor, solo se dispara una sincronizacion. Para produccion,
// protege este endpoint con GMAIL_WEBHOOK_TOKEN.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const secret = process.env.GMAIL_WEBHOOK_TOKEN;
  if (secret) {
    const token = req.headers.get("x-webhook-token") || req.nextUrl.searchParams.get("token");
    if (token !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const body = await req.json().catch(() => null);
    const message = body?.message;
    if (message?.data) {
      const decoded = JSON.parse(Buffer.from(message.data, "base64url").toString("utf8"));
      if (decoded.emailAddress) {
        // sincronizar solo la cuenta que ha cambiado seria ideal;
        // por simplicidad sincronizamos todas las cuentas (app interna)
        const count = await syncAllUsers();
        return NextResponse.json({ ok: true, synced: count });
      }
    }
    return NextResponse.json({ ok: true, synced: 0 });
  } catch (e) {
    console.error("Webhook error", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}