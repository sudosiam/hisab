/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  clearMocks: true,
  moduleNameMapper: {
    '^expo-file-system/legacy$': '<rootDir>/src/__mocks__/expo-file-system.ts',
    '^expo-sqlite$': '<rootDir>/src/__mocks__/expo-sqlite.ts',
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/__mocks__/async-storage.ts',
  },
};
