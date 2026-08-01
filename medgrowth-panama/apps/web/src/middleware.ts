export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/crm/:path*",
    "/leads/:path*",
    "/landing-builder/:path*",
    "/campaigns/:path*",
    "/whatsapp/:path*",
    "/calendar/:path*",
    "/reports/:path*",
    "/billing/:path*",
    "/audit/:path*",
    "/settings/:path*",
  ],
};
