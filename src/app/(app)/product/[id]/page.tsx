import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProductView from "@/components/ProductView";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!product) notFound();

  const [{ data: contacts }, { data: sources }] = await Promise.all([
    supabase.from("contacts").select("*").eq("product_id", id).eq("user_id", user.id),
    supabase
      .from("manufacturer_sources")
      .select("*")
      .eq("product_id", id)
      .eq("user_id", user.id),
  ]);

  return (
    <div className="space-y-4">
      <ProductView product={product} contacts={contacts || []} sources={sources || []} />
    </div>
  );
}