/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js"],
  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};

