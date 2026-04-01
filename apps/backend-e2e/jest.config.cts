module.exports = {
  displayName: 'backend-e2e',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm/[^/]+/node_modules/)?(uuid)/)',
  ],
  setupFiles: ['<rootDir>/src/support/set-test-env.ts'],
  testMatch: ['<rootDir>/src/**/*.e2e-spec.ts'],
  moduleNameMapper: {
    '^@files-assistant/core$': '<rootDir>/../../libs/core/src/index.ts',
    '^@files-assistant/events$': '<rootDir>/../../libs/events/src/index.ts',
    '^@files-assistant/weaviate$': '<rootDir>/../../libs/weaviate/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
  coverageDirectory: '../../coverage/apps/backend-e2e',
  testTimeout: 120_000,
  globalSetup: '<rootDir>/src/support/global-setup.ts',
  globalTeardown: '<rootDir>/src/support/global-teardown.ts',
};
