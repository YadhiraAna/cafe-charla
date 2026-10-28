"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/hooks/useAuth";
import { necesitaTicketParaForo } from "@/lib/tickets/reglas";

/** ¿La persona puede interactuar en el foro? Sí si ya canjeó al menos un ticket (moderadores y administradores quedan exentos). */
export function useTieneTicket() {
  const { user, profile, loading } = useAuth();
  const [r, setR] = useState<{ uid: string; tiene: boolean } | null>(null);
  useEffect(() => {
    if (!user || !profile) return;
    if (!necesitaTicketParaForo(profile.role)) { setR({ uid: user.uid, tiene: true }); return; }
    let vivo = true;
    getDocs(query(collection(db, "ticket_claims"), where("userId", "==", user.uid), limit(1)))
      .then(s => { if (vivo) setR({ uid: user.uid, tiene: !s.empty }); })
      .catch(() => { if (vivo) setR({ uid: user.uid, tiene: false }); });
    return () => { vivo = false; };
  }, [user, profile]);
  const listo = !!user && !!profile && r?.uid === user.uid;
  return { cargando: loading || (!!user && !listo), tiene: listo ? r!.tiene : false };
}