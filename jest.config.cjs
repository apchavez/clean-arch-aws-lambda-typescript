module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "./tsconfig.jest.json" }],
  },
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  roots: ["<rootDir>/tests", "<rootDir>/src"],
  testMatch: ["**/?(*.)+(spec|test).ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/infra/db-init.ts",
    "!src/infra/secrets-init.ts",
    "!src/infra/cfn-response.ts",
    "!src/infra/repos/MySQLCountryBookingRepo.ts",
    "!src/infra/messaging/eventbridge.service.ts",
  ],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};
