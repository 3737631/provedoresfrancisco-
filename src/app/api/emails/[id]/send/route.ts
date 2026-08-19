import { NextRequest, NextResponse } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { getOAuthClient } from "@/lib/gmail/oauth";
import { sendEmail } from "@/lib/gmail/gmail";
import { decrypt } from "@/lib/crypto";

// POST /api/emails/[id]/send
// Envia el email via Gmail SOLO si el usuario lo confirma explicitamente (confirm: true).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body?.confirm) {
    return fail("Debes confirmar el envio manualmente (confirm: true)");
  }

  // Cargar email
  const { data: email, error } = await supabase
    .from("emails")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!email) return fail("Email no encontrado", 404);
  if (!email.to_email) return fail("El email no tiene destinatario");

  // Cargar tokens Gmail
  const { data: account, error: aErr } = await supabase
    .from("gmail_accounts")
    .select("access_token_enc, refresh_token_enc, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (aErr) return fail(aErr.message, 500);
  if (!account) {
    return fail(
      "No hay una cuenta de Gmail conectada. Conectala en Ajustes, o copia el email y envialo manualmente.",
      400
    );
  }

  try {
    const authClient = getOAuthClient();
    authClient.setCredentials({
      access_token: decrypt(account.access_token_enc),
      refresh_token: decrypt(account.refresh_token_enc),
      expiry_date: account.expires_at ? new Date(account.expires_at).getTime() : undefined,
    });

    const sent = await sendEmail(authClient, email.to_email, email.subject, email.body);

    // Marcar como enviado
    const { data: updated } = await supabase
      .from("emails")
      .update({
        status: "sent",
        gmail_message_id: sent.id || null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    // Actualizar proveedor -> contactado
    if (email.supplier_id) {
      await supabase
        .from("suppliers")
        .update({
          status: "contactado",
          first_contact_date: new Date().toISOString(),
          last_message: email.body.slice(0, 3000),
        })
        .eq("id", email.supplier_id);
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