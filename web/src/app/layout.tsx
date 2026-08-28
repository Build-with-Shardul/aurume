import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppChrome from "@/components/app-chrome";
import { getSession, getActiveMembership, canManageOrg, isInstanceAdmin } from "@/lib/auth-server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aurume",
  description: "Idea to delivery, with lineage — an open-source AI product-management platform.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  const m = session ? await getActiveMembership() : null;
  const instanceAdmin = session ? await isInstanceAdmin().catch(() => false) : false;
  const user = { name: session?.user.name ?? "", email: session?.user.email ?? "" };

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppChrome authed={!!m?.orgId} user={user} role={m?.role ?? null} canManage={canManageOrg(m?.role ?? null)} instanceAdmin={instanceAdmin}>
          {children}
        </AppChrome>
      </body>
    </html>
  );
}
