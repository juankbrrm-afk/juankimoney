import type { RoleName } from "@medgrowth/config";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: RoleName;
      organizationId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: RoleName;
    organizationId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: RoleName;
    organizationId: string | null;
  }
}
