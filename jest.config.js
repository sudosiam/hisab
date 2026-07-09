/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.integration.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  clearMocks: true,
  moduleNameMapper: {
    '^expo-file-system/legacy$': '<rootDir>/src/__mocks__/expo-file-system.ts',
    '^expo-sqlite$': '<rootDir>/src/__mocks__/expo-sqlite.ts',
    '^expo-document-picker$': '<rootDir>/src/__mocks__/expo-document-picker.ts',
    '^expo-sharing$': '<rootDir>/src/__mocks__/expo-sharing.ts',
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/__mocks__/async-storage.ts',
  },
};
