import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe part of the Auth.js config (no database), shared by the proxy and
// the full config in auth.ts. Google is the only way to sign in or sign up.

export const authConfig = {
  providers: [Google],
  pages: { signIn: "/signin" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  callbacks: {
    session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
