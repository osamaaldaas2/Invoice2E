/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No circular dependencies allowed (CONSTITUTION: architecture_constraints)',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'No orphan modules — every module should be reachable from an entry point',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+',
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)(?:babel|jest|vitest|prettier|eslint|dependency-cruiser)\\.config',
          '\\.test\\.(ts|tsx)$',
          '__tests__',
          '__mocks__',
        ],
      },
      to: {},
    },
    {
      name: 'components-no-direct-service-import',
      severity: 'error',
      comment:
        'components/ cannot import from services/ directly — must go through hooks/ (CONSTITUTION: file_structure_rules)',
      from: {
        path: '^components/',
      },
      to: {
        path: '^services/',
      },
    },
    {
      name: 'services-no-component-import',
      severity: 'error',
      comment:
        'services/ cannot import from components/ (CONSTITUTION: architecture_constraints)',
      from: {
        path: '^services/',
      },
      to: {
        path: '^components/',
      },
    },
    {
      name: 'adapters-no-component-or-app-import',
      severity: 'error',
      comment:
        'adapters/ cannot import from components/ or app/ (CONSTITUTION: architecture_constraints)',
      from: {
        path: '^adapters/',
      },
      to: {
        path: '^(components|app)/',
      },
    },
    {
      name: 'lib-no-service-or-component-import',
      severity: 'error',
      comment:
        'lib/ cannot import from services/ or components/ (CONSTITUTION: file_structure_rules)',
      from: {
        path: '^lib/',
      },
      to: {
        path: '^(services|components)/',
      },
    },
    {
      name: 'types-only-import-types',
      severity: 'error',
      comment:
        'types/ cannot import from anything except other types/ (CONSTITUTION: file_structure_rules)',
      from: {
        path: '^types/',
      },
      to: {
        pathNot: '^types/',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'domains-no-circular-cross-import',
      severity: 'error',
      comment:
        'Domain modules cannot have circular dependencies with other domains (CONSTITUTION: architecture_constraints)',
      from: {
        path: '^domains/([^/]+)/',
      },
      to: {
        path: '^domains/([^/]+)/',
        pathNot: '^domains/$1/',
        circular: true,
      },
    },
    {
      name: 'domains-no-component-or-app-import',
      severity: 'error',
      comment:
        'domains/ cannot import from components/, app/, hooks/, or lib/ (domain isolation)',
      from: {
        path: '^domains/',
      },
      to: {
        path: '^(components|app|hooks|lib)/',
      },
    },
    {
      name: 'domains-no-direct-service-import',
      severity: 'warn',
      comment:
        'domains/ should not import from services/ directly — migrate logic into domain services (temporary warning during migration)',
      from: {
        path: '^domains/',
      },
      to: {
        path: '^services/',
      },
    },
    {
      name: 'domain-internals-not-bypassed',
      severity: 'error',
      comment:
        'External code must import from domain barrel (index.ts), not internal domain files',
      from: {
        pathNot: '^domains/',
      },
      to: {
        path: '^domains/[^/]+/.+',
        pathNot: '^domains/[^/]+/index\\.ts$',
      },
    },
    {
      name: 'api-routes-no-component-import',
      severity: 'error',
      comment:
        'app/api/ routes cannot import from components/ (CONSTITUTION: architecture_constraints)',
      from: {
        path: '^app/api/',
      },
      to: {
        path: '^components/',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['main', 'types', 'typings'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/(?:@[^/]+/[^/]+|[^/]+)',
      },
      text: {
        highlightFocused: true,
      },
    },
  },
};
