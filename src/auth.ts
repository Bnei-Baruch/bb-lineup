import NextAuth, { type DefaultSession } from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

declare module "next-auth" {
  interface Session {
    user: {
      roles: string[];
    } & DefaultSession["user"];
  }
}

type TokenWithRoles = { roles?: string[] };

export const { handlers, auth, signIn, signOut } = NextAuth({
  debug: true,
  providers: [
    Keycloak({
      // Public client (no client secret) — PKCE-protected authorization code flow.
      checks: ["pkce"],
      client: { token_endpoint_auth_method: "none" },
    }),
  ],
  callbacks: {
    jwt({ token, profile }) {
      if (profile) {
        const realmAccess = profile.realm_access as { roles?: string[] } | undefined;
        (token as TokenWithRoles).roles = realmAccess?.roles ?? [];
      }
      return token;
    },
    session({ session, token }) {
      session.user.roles = (token as TokenWithRoles).roles ?? [];
      return session;
    },
  },
});
