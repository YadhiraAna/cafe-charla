import "./globals.css";
import type { Metadata } from "next";
import { Young_Serif, Figtree } from "next/font/google";
import { AuthProvider } from "@/hooks/useAuth";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { DomProvider } from "@/components/antibot/DomProvider";
import Beacon from "@/components/antibot/Beacon";
import IdleGuard from "@/components/session/IdleGuard";
import AceptarTerminos from "@/components/legal/AceptarTerminos";
import AvisoCookies from "@/components/legal/AvisoCookies";
import { domSalt } from "@/lib/antibot/dom";

const display = Young_Serif({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Figtree({ subsets: ["latin"], variable: "--font-body" });

export const dynamic = "force-dynamic"; // la sal del DOM debe calcularse en cada petición, no en el build

export const metadata: Metadata = {
  title: { default: "Café & Charla", template: "%s · Café & Charla" },
  description: "Cafetería de barrio con menú de temporada, promociones y una comunidad para conversar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const salt = domSalt();
  return (
    <html lang="es" className={`${display.variable} ${body.variable}`}>
      <body data-ds={salt}>
        <AuthProvider>
          <DomProvider salt={salt}>
            <a href="#contenido" className="skip">Saltar al contenido</a>
            <Header />
            <main id="contenido" className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
            <Footer />
            <Beacon />
            <IdleGuard />
            <AceptarTerminos />
            <AvisoCookies />
          </DomProvider>
        </AuthProvider>
      </body>
    </html>
  );
}