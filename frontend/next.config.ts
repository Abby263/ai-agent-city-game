import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  const development = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    reactStrictMode: true,
    allowedDevOrigins: ["127.0.0.1", "localhost"],
    ...(development
      ? {
          async rewrites() {
            const backend = (
              process.env.LOCAL_API_ORIGIN || "http://127.0.0.1:8000"
            ).replace(/\/$/, "");
            return [
              { source: "/api/:path*", destination: `${backend}/:path*` },
            ];
          },
        }
      : { output: "export" as const }),
  };
}
