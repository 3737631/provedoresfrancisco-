import { NextRequest, NextResponse } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { getOAuthClient, hasGmailConfig } from "@/lib/gmail/oauth";
import { sendEmail } from "@/lib/gmail/gmail";
import { decrypt } from "@/lib/crypto";
import { store } from "@/lib/store";

// POST /api/emails/[id]/send
// Envia el email via Gmail SOLO si el usuario lo confirma explicitamente (confirm: true).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body?.confirm) {
    return fail("Debes confirmar el envio manualmente (confirm: true)");
  }

  try {
    const email = await store.getEmail(auth.userId, id);
    if (!email) return fail("Email no encontrado", 404);
    if (!email.to_email) return fail("El email no tiene destinatario");

    const account = await store.getGmailAccount(auth.userId);
    if (!account) {
      return fail(
        "No hay una cuenta de Gmail conectada. Copia el email y envialo manualmente (botones Copiar / Abrir Gmail).",
        400
      );
    }
    if (!hasGmailConfig()) {
      return fail(
        "Gmail no esta configurado en este servidor. Copia el email y envialo manualmente.",
        400
      );
    }

    const authClient = getOAuthClient();
    authClient.setCredentials({
      access_token: decrypt(String(account.access_token_enc)),
      refresh_token: decrypt(String(account.refresh_token_enc)),
      expiry_date: account.expires_at
        ? new Date(String(account.expires_at)).getTime()
        : undefined,
    });

    const sent = await sendEmail(authClient, String(email.to_email), String(email.subject), String(email.body));

    const updated = await store.updateEmail(auth.userId, id, {
      status: "sent",
      gmail_message_id: sent.id || null,
      sent_at: new Date().toISOString(),
    });

    if (email.supplier_id) {
      await store.updateSupplier(auth.userId, String(email.supplier_id), {
        status: "contactado",
        first_contact_date: new Date().toISOString(),
        last_message: String(email.body).slice(0, 3000),
      });
    }

    return ok({ sent: true, messageId: sent.id, email: updated });
  } catch (e) {
    console.error("Send error", e);
    return NextResponse.json(
      { error: "No se pudo enviar el email. Revisa la conexion de Gmail." },
      { status: 500 }
    );
  }
}