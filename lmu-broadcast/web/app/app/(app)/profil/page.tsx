"use client";

import ProfileForm from "@/components/ProfileForm";
import RequireAuth from "@/components/RequireAuth";

export default function Profil() {
  return (
    <RequireAuth>
      <ProfileForm />
    </RequireAuth>
  );
}
