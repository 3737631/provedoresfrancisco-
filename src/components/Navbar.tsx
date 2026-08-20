"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { isLocalMode } from "@/lib/config-browser";

interface Notification {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

export default function Navbar({ userEmail }: { userEmail: string | null }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setNotifications(
        (data.notifications || []).filter((n: any) => !n.is_read).slice(0, 5)
      );
    } catch {
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  const links = [
    { href: "/analyze", label: "AliExpress" },
    { href: "/products", label: "Productos" },
    { href: "/crm", label: "Proveedores" },
    { href: "/responses", label: "Respuestas" },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-extrabold text-xl text-brand-600 tracking-tight">
              Prove<span className="text-slate-800">Dores</span>
            </span>
            <span className="text-xs text-slate-400 font-medium">Alvaro</span>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  isActive(l.href)
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => {
                setOpen(!open);
                if (!open) {
                  fetch("/api/notifications", { method: "PATCH" })
                    .then(() => setTimeout(refresh, 500));
                }
              }}
              className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="Notificaciones"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-lg p-2">
                <div className="px-3 py-2 text-sm font-semibold text-slate-700">
                  Notificaciones
                </div>
                {notifications.length === 0 && (
                  <div className="px-3 py-4 text-sm text-slate-500">
                    Sin notificaciones nuevas.
                  </div>
                )}
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setOpen(false);
                      router.push("/responses");
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50"
                  >
                    <div className="text-sm font-medium text-slate-800">{n.body}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(n.created_at).toLocaleString("es-ES")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="hidden sm:block text-sm text-slate-500 max-w-[180px] truncate">
            {userEmail}
          </div>
          <button
            onClick={async () => {
              if (!isLocalMode) {
                const { createClient } = await import("@/lib/supabase/client");
                await createClient().auth.signOut();
              }
              router.push("/login");
            }}
            className="text-sm text-slate-500 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50"
          >
            Salir
          </button>
        </div>
      </div>
    </nav>
  );
}