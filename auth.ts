import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { authConfig } from "./auth.config";
import { dbConfigured, getDb } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";

// Full Auth.js setup: the Drizzle adapter stores users and their linked Google
// accounts, so every BenchMate row can belong to a stable user id. Sessions
// themselves are signed JWT cookies (no per-request database lookup).

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  ...authConfig,
  adapter: dbConfigured()
    ? DrizzleAdapter(getDb(), { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens })
    : undefined,
}));
