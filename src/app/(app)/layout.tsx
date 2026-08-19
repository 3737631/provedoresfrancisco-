import Navbar from "@/components/Navbar";
import { getCurrentUserInfo } from "@/lib/api-helpers";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserInfo();

  return (
    <div className="min-h-screen">
      <Navbar userEmail={user.email} />
      <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}