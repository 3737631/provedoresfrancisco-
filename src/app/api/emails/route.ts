import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api-helpers";
import { store } from "@/lib/store";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  try {
    const emails = await store.listEmails(auth.userId);
    return ok({ emails });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) return fail("Cuerpo invalido");

  try {
    const email = await store.insertEmail(auth.userId, {
      product_id: body.product_id || null,
      contact_id: body.contact_id || null,
      supplier_id: body.supplier_id || null,
      to_email: body.to_email || null,
      subject: body.subject || "",
      body: body.body || "",
      status: "draft",
    });
    return ok({ email });
  } catch (e: any) {
    return fail(e.message || "Error", 500);
  }
}