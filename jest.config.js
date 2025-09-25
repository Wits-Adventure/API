module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: [
    'functions/auth.js',
    'routes/users.js',
    'routes/upload.js',
    '!**/node_modules/**'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/functions/**/*.test.js',
    '<rootDir>/routes/**/*.test.js'
  ]
};