import type { Config } from 'jest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);
const paths = tsconfig?.compilerOptions?.paths ?? {};

// NFR-OPS-03 (CI coverage gate): backend unit coverage >= 80% on the
// transaction engine and >= 60% overall. `npm run test:cov` fails the build
// when a threshold is missed.
const coverageThreshold: NonNullable<Config['coverageThreshold']> = {
  global: { statements: 60, branches: 60, functions: 60, lines: 60 },
};

// The transaction engine (SRS 2: src/transactions) does not exist yet. Jest
// fails on a threshold path that matches no files, so the 80% rule switches
// itself on as soon as the folder is added.
if (existsSync(join('src', 'transactions'))) {
  coverageThreshold['./src/transactions/'] = {
    statements: 80,
    branches: 80,
    functions: 80,
    lines: 80,
  };
}

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
  // main.ts and the *.module.ts files only wire the app together; the API
  // (e2e) tests exercise them, so they are not counted as unit coverage.
  collectCoverageFrom: ['**/*.(t|j)s', '!main.ts', '!**/*.module.ts'],
  coverageDirectory: '../coverage',
  coverageThreshold,
  testEnvironment: 'node',
};

export default config;