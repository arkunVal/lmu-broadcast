"use client";

// Startseite = Anmeldung. Diese Datei ersetzt auch eine alte Test-Startseite ("Livetest") aus frueheren Phasen.
import { AuthProvider } from "@/lib/auth";
import Shell from "@/components/Nav";
import Login from "./(app)/login/page";

export default function Home() {
  return (
    <AuthProvider>
      <Shell>
        <Login />
      </Shell>
    </AuthProvider>
  );
}
