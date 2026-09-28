import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { auth } from "@/auth";
import { AuthProvider } from "@/components/auth/AuthProvider";
import "./globals.css";

// A soft, rounded sans that reads calmly at large sizes.
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "BenchMate",
  description:
    "BenchMate reads your lab steps out loud, writes down what you say, and turns it into a tidy notebook entry, so your hands can stay on the work.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1418",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en" className={figtree.variable}>
      <body className="flex min-h-dvh flex-col">
        <AuthProvider session={session}>
          <div className="flex flex-1 flex-col">{children}</div>
        </AuthProvider>
        <footer className="no-print px-4 py-5 text-center text-xs leading-relaxed text-faint">
          Your sessions are private to your account. Audio and protocol text are sent to AssemblyAI only for the live session and for reading
          pasted protocols.
        </footer>
      </body>
    </html>
  );
}
