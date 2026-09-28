import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const pureModuleRules = {
  files: ["src/modules/**/*.{ts,tsx}"],
  rules: {
    "@typescript-eslint/no-restricted-types": [
      "error",
      {
        types: {
          Headers: {
            message: "Pure Modules use product-owned metadata, not Web Headers types.",
          },
          Request: {
            message: "Pure Modules use product-owned request data, not Web Request types.",
          },
          Response: {
            message: "Pure Modules return product-owned results, not Web Response types.",
          },
        },
      },
    ],
    "import/no-restricted-paths": [
      "error",
      {
        zones: [
          {
            from: "./src/app",
            message: "Pure Modules cannot depend on the Web implementation.",
            target: "./src/modules",
          },
          {
            from: "./src/adapters",
            message: "Pure Modules depend on product-owned Interfaces, not Adapters.",
            target: "./src/modules",
          },
          {
            from: "./src/application",
            message: "Pure Modules cannot depend on application workflow orchestration.",
            target: "./src/modules",
          },
        ],
      },
    ],
    "no-restricted-globals": [
      "error",
      {
        message: "Pure Modules use product-owned request data, not Web Request types.",
        name: "Request",
      },
      {
        message: "Pure Modules return product-owned results, not Web Response types.",
        name: "Response",
      },
      {
        message: "Pure Modules use product-owned metadata, not Web Headers types.",
        name: "Headers",
      },
    ],
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "next",
              "next/*",
              "react",
              "react/*",
              "drizzle-orm",
              "drizzle-orm/*",
              "pg",
              "pg/*",
              "graphile-worker",
              "graphile-worker/*",
              "ai",
              "ai/*",
              "@ai-sdk/*",
              "http",
              "http/*",
              "https",
              "https/*",
              "node:http",
              "node:http/*",
              "node:https",
              "node:https/*",
            ],
            message:
              "Pure Modules cannot import Web, UI, database, queue, model-provider or HTTP packages.",
          },
        ],
      },
    ],
  },
};

const deterministicTestRules = {
  files: ["tests/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        message: "Tests use an injected Clock or explicit fixed instant, not Date.now().",
        selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
      },
      {
        message: "Tests use an injected Clock or explicit fixed instant, not new Date().",
        selector: "NewExpression[callee.name='Date'][arguments.length=0]",
      },
      {
        message: "Tests use an injected IdGenerator, not Math.random().",
        selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
      },
      {
        message: "Tests use an injected IdGenerator, not an imported random generator.",
        selector: "CallExpression[callee.name=/^(randomUUID|randomBytes|randomInt)$/]",
      },
      {
        message: "Tests use an injected IdGenerator, not a global crypto random generator.",
        selector:
          "CallExpression[callee.object.name='crypto'][callee.property.name=/^(randomUUID|getRandomValues)$/]",
      },
    ],
  },
};

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  pureModuleRules,
  deterministicTestRules,
  globalIgnores([
    ".next/**",
    ".runtime/**",
    "backend/**",
    "coverage/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "web/dist/**",
  ]),
]);
