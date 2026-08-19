import { notFound } from "next/navigation";
import ProductView from "@/components/ProductView";
import { getCurrentUserInfo } from "@/lib/api-helpers";
import { store } from "@/lib/store";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUserInfo();

  const { product, contacts, sources } = await store.getProductWithDetails(user.id, id);
  if (!product) notFound();

  return (
    <div className="space-y-4">
      <ProductView product={product} contacts={contacts} sources={sources} />
    </div>
  );
}