import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";
import type { RoleName } from "@medgrowth/config";

/**
 * Auth.js (NextAuth) credentials-based auth for the MVP. Kept behind this
 * single file so migrating to Clerk later (docs/RISKS.md #7) means
 * swapping this module, not touching every page that reads `session.user`.
 */
export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({ where: { email: credentials.email } });
        if (!user || !user.active) return null;

        const validPassword = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!validPassword) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: RoleName }).role;
        token.organizationId = (user as { organizationId: string | null }).organizationId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as RoleName;
        session.user.organizationId = token.organizationId as string | null;
      }
      return session;
    },
  },
};
