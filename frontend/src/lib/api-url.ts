/** Base URL for the FastAPI backend (proxied at /api in development and on Vercel). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
