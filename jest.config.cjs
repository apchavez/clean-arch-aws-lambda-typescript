module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "./tsconfig.jest.json" }],
  },
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  roots: ["<rootDir>/tests", "<rootDir>/src"],
  testMatch: ["**/?(*.)+(spec|test).ts"],
};
