"use client";

import { AuthProvider } from "@/lib/auth";
import Nav from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="wrap">
        <Nav />
        {children}
      </div>
    </AuthProvider>
  );
}
