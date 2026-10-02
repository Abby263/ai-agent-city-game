import nextVitals from "eslint-config-next/core-web-vitals";

// Copies of third-party modules made at build time (scripts/vendor-headtts.mjs).
const eslintConfig = [{ ignores: ["src/vendor/**", "public/vendor/**"] }, ...nextVitals];

export default eslintConfig;
