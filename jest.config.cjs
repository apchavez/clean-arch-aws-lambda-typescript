module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "./tsconfig.jest.json" }],
  },
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  roots: ["<rootDir>/tests", "<rootDir>/src"],
  testMatch: ["**/?(*.)+(spec|test).ts"],
  testPathIgnorePatterns: ["/node_modules/", "/tests/integration/"],
  collectCoverageFrom: ["src/**/*.ts"],
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
