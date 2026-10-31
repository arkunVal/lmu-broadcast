"use client";

import { useRouter } from "next/navigation";
import ProfileForm from "@/components/ProfileForm";
import { useAuth } from "@/lib/auth";

export default function AccountTab() {
  const { signOut } = useAuth();
  const router = useRouter();
  return (
    <div className="scrollarea">
      <ProfileForm embedded />
      <div style={{ marginTop: 12 }}>
        <button onClick={async () => { await signOut(); router.replace("/"); }}>Abmelden</button>
      </div>
    </div>
  );
}
