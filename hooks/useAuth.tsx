"use client";
/** Sesión global: usuario de Firebase + perfil (users/{uid}). El rol mostrado aquí solo sirve para la UI; la autorización real está en el servidor y en las reglas. */
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { apiFetch } from "@/lib/utils/api";
import type { Profile } from "@/types";

interface Ctx { 
  user: User | null; 
  profile: Profile | null; 
  loading: boolean; 
  refreshProfile: () => Promise<void>; 
  logout: (motivo?: string) => Promise<void> 
}

const AuthCtx = createContext<Ctx>({ 
  user: null, 
  profile: null, 
  loading: true, 
  refreshProfile: async () => {}, 
  logout: async () => {} 
});

export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) return setProfile(null);
    try { 
      const s = await getDoc(doc(db, "users", u.uid)); 
      setProfile(s.exists() ? (s.data() as Profile) : null); 
    } catch { 
      setProfile(null); 
    }
  }, []);

  useEffect(() => onAuthStateChanged(auth, async u => { 
    setUser(u); 
    await loadProfile(u); 
    setLoading(false); 
  }), [loadProfile]);

  const logout = async (motivo?: string) => {
    await apiFetch("/api/auth/logout", { method: "POST", body: motivo ? { motivo } : undefined }).catch(() => {});
    await apiFetch("/api/auth/sesion", { method: "DELETE", anon: true }).catch(() => {}); // borra las cookies aunque la sesión ya haya expirado
    try { 
      sessionStorage.clear(); 
      localStorage.removeItem("cc_actividad"); 
    } catch { 
      /* almacenamiento bloqueado */ 
    }
    await signOut(auth);
  };

  return (
    <AuthCtx.Provider value={{ user, profile, loading, refreshProfile: () => loadProfile(auth.currentUser), logout }}>
      {children}
    </AuthCtx.Provider>
  );
}