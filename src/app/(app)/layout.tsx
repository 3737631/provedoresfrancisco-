import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen">
      <Navbar userEmail={user?.email ?? null} />
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}