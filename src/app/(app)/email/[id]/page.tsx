import EmailReview from "@/components/EmailReview";

export default async function EmailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EmailReview emailId={id} />;
}