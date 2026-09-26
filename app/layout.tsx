import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BenchMate",
  description: "Hands-free voice lab assistant: protocol reader and lab notebook.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1113" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh flex flex-col">
        <div className="flex-1 flex flex-col">{children}</div>
        <footer className="no-print px-4 py-2 text-center text-xs text-muted">
          Lab data stays in this browser. Audio and protocol text are sent to AssemblyAI only for the live session and protocol parsing.
        </footer>
      </body>
    </html>
  );
}
