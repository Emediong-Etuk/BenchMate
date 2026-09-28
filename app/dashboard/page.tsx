import type { Metadata } from "next";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const metadata: Metadata = { title: "Dashboard · BenchMate" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const { start } = await searchParams;
  return <DashboardClient autoStart={typeof start === "string" ? start : null} />;
}
