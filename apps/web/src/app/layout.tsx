import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import { BottomNav } from "@/components/BottomNav";
import { ServiceWorker } from "@/components/ServiceWorker";
import { withBase } from "@/lib/base-path";
import "./globals.css";

export const metadata: Metadata = {
  title: "DressIt — il tuo stylist AI",
  description: "Fotografa i tuoi vestiti e lascia che l'AI ti consigli l'outfit perfetto.",
  applicationName: "DressIt",
  // GitHub Pages cannot send a Referrer-Policy header: the <meta name="referrer"> tag does the same job.
  referrer: "strict-origin-when-cross-origin",
  appleWebApp: { capable: true, title: "DressIt", statusBarStyle: "black-translucent" },
  icons: {
    icon: withBase("/icons/icon-192.png"),
    apple: withBase("/icons/apple-touch-icon.png"),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#141220" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-dvh font-sans antialiased">
        <AuthProvider>
          <main className="mx-auto max-w-xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">
            {children}
          </main>
          <BottomNav />
        </AuthProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
