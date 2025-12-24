import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      // Disable rules that have ESLint 9 compatibility issues
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      // Disable react-refresh rule (not available in Next.js)
      "react-refresh/only-export-components": "off",
      // Allow unescaped entities in JSX (common in text content)
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
