"use client";

import { AuthProvider } from "@/lib/auth";
import Nav from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Nav />
      <div className="wrap">{children}</div>
    </AuthProvider>
  );
}
