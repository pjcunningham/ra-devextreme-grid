import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';

const ROOT_DIR = path.resolve('.');
const TEMP_BASE = path.join(os.tmpdir(), `ra-dx-smoke-${Date.now()}`);

console.log('--- Step 2: Packaging & Isolated Consumer Verification ---');
console.log(`Root directory: ${ROOT_DIR}`);
console.log(`Temporary consumer base: ${TEMP_BASE}`);

function run(cmd, cwd = ROOT_DIR) {
  console.log(`[EXEC] ${cmd} (in ${cwd})`);
  return execSync(cmd, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, CI: 'true' },
  });
}

let tarballPath = null;

try {
  // 1. Production library build
  console.log('\n1. Building library bundle and declarations...');
  run('pnpm build');

  // 2. Generate real .tgz tarball
  console.log('\n2. Packing npm tarball...');
  const packOutput = execSync('npm pack', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
  const tarballName = packOutput.split('\n').pop().trim();
  tarballPath = path.join(ROOT_DIR, tarballName);
  console.log(`Generated tarball: ${tarballPath}`);

  if (!fs.existsSync(tarballPath)) {
    throw new Error(`Tarball not found at ${tarballPath}`);
  }

  // Helper to test consumer with specific React version
  function testConsumer(
    reactVersion,
    reactDomVersion,
    reactTypesVersion,
    reactDomTypesVersion,
    label
  ) {
    console.log(`\n=== Testing Isolated Consumer: ${label} ===`);
    const consumerDir = path.join(TEMP_BASE, label.toLowerCase().replace(/[^a-z0-9]/g, '-'));
    fs.mkdirSync(consumerDir, { recursive: true });

    // Copy tarball to consumer dir to avoid cross-drive/relative path issues
    const localTarball = path.join(consumerDir, tarballName);
    fs.copyFileSync(tarballPath, localTarball);

    // Write package.json
    const consumerPkg = {
      name: `consumer-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      version: '1.0.0',
      private: true,
      type: 'module',
      dependencies: {
        'ra-devextreme-grid': `file:./${tarballName}`,
        react: reactVersion,
        'react-dom': reactDomVersion,
        'react-admin': '^5.15.3',
        devextreme: '26.1.4',
        'devextreme-react': '26.1.4',
      },
      devDependencies: {
        '@types/react': reactTypesVersion,
        '@types/react-dom': reactDomTypesVersion,
        '@vitejs/plugin-react': '^4.3.4',
        typescript: '~5.8.2',
        vite: '^6.2.0',
      },
    };

    fs.writeFileSync(
      path.join(consumerDir, 'package.json'),
      JSON.stringify(consumerPkg, null, 2),
      'utf-8'
    );

    // Write tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        useDefineForClassFields: true,
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        skipLibCheck: true,
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
      },
      include: ['src'],
    };

    fs.writeFileSync(
      path.join(consumerDir, 'tsconfig.json'),
      JSON.stringify(tsconfig, null, 2),
      'utf-8'
    );

    // Write vite.config.ts
    const viteConfig = `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`;
    fs.writeFileSync(path.join(consumerDir, 'vite.config.ts'), viteConfig, 'utf-8');

    // Create src directory
    const srcDir = path.join(consumerDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Write App.tsx exercising both Managed and Remote modes + Types
    const appTsx = `
import { useState } from 'react';
import {
  DatagridDX,
  DatagridDXPagination,
  DatagridDXRemote,
  defaultGetDxFilterValue,
  defaultGetRaFilters,
  parseRaFilterKey,
  type DatagridDXProps,
  type DatagridDXDataProvider,
  type GetGridParams,
  type GetGridResult,
  type GetGridGroupDescriptor,
  type GetGridSummaryDescriptor,
  type GetGridSortDescriptor,
  type ParsedRaFilterKey,
} from 'ra-devextreme-grid';
import { Column } from 'devextreme-react/data-grid';
import { Admin, Resource, List, type RaRecord } from 'react-admin';

interface CustomerRecord extends RaRecord<number> {
  id: number;
  name: string;
  country: string;
  status: string;
  balance: number;
}

// 1. Verify Remote DataProvider implementation and types
const mockRemoteDataProvider: DatagridDXDataProvider = {
  getGrid: async <RecordType extends RaRecord = RaRecord>(
    resource: string,
    params: GetGridParams,
  ): Promise<GetGridResult<RecordType>> => {
    const sort: GetGridSortDescriptor[] | undefined = params.loadOptions.sort;
    const group: GetGridGroupDescriptor[] | undefined = params.loadOptions.group;
    const summaries: GetGridSummaryDescriptor[] | undefined = params.loadOptions.totalSummary;
    console.log(resource, sort, group, summaries);

    return {
      data: [
        { id: 1, name: 'Acme Corp', country: 'US', status: 'active', balance: 5000 },
      ] as unknown as RecordType[],
      totalCount: 1,
      summary: [5000],
    };
  },
  getList: async () => ({ data: [], total: 0 }),
  getOne: async () => ({ data: {} as any }),
  getMany: async () => ({ data: [] }),
  getManyReference: async () => ({ data: [], total: 0 }),
  update: async () => ({ data: {} as any }),
  updateMany: async () => ({ data: [] }),
  create: async () => ({ data: {} as any }),
  delete: async () => ({ data: {} as any }),
  deleteMany: async () => ({ data: [] }),
};

// 2. Managed Grid Consumer Component
const ManagedCustomerList = () => {
  const managedProps: DatagridDXProps<CustomerRecord> = {
    layoutPreferenceKey: 'consumer.managed.customers',
    selection: { showCheckBoxesMode: 'always' },
    filtering: { applyFilter: 'auto' },
    rowClick: 'edit',
  };

  return (
    <List>
      <DatagridDX<CustomerRecord> {...managedProps}>
        <Column dataField="id" caption="ID" width={80} />
        <Column dataField="name" caption="Name" />
        <Column dataField="country" caption="Country" />
        <Column dataField="balance" caption="Balance" dataType="number" format="currency" />
      </DatagridDX>
      <DatagridDXPagination />
    </List>
  );
};

// 3. Remote Grid Consumer Component (Native, outside <List>)
const RemoteCustomerGrid = () => {
  return (
    <DatagridDXRemote<CustomerRecord>
      resource="customers"
      layoutPreferenceKey="consumer.remote.customers"
      grouping={{ contextMenuEnabled: true }}
      groupPaging={true}
      summary={{
        totalItems: [{ column: 'balance', summaryType: 'sum', valueFormat: 'currency' }],
      }}
    >
      <Column dataField="id" caption="ID" width={80} />
      <Column dataField="name" caption="Customer Name" />
      <Column dataField="country" caption="Country" groupIndex={0} />
      <Column dataField="balance" caption="Balance" dataType="number" />
    </DatagridDXRemote>
  );
};

// 4. Utility function check
const testFilterUtility = () => {
  const parsed: ParsedRaFilterKey = parseRaFilterKey('balance_gte');
  const dxFilter = defaultGetDxFilterValue({ balance_gte: 100 }, { gridColumns: ['balance'] });
  const raFilters = defaultGetRaFilters(dxFilter, { gridColumns: ['balance'] });
  return { parsed, raFilters, dxFilter };
};

export const App = () => {
  const [mode, setMode] = useState<'managed' | 'remote'>('managed');
  testFilterUtility();

  return (
    <Admin dataProvider={mockRemoteDataProvider}>
      <button onClick={() => setMode(mode === 'managed' ? 'remote' : 'managed')}>
        Switch Mode
      </button>
      {mode === 'managed' ? (
        <Resource name="customers" list={ManagedCustomerList} />
      ) : (
        <RemoteCustomerGrid />
      )}
    </Admin>
  );
};
`;
    fs.writeFileSync(path.join(srcDir, 'App.tsx'), appTsx, 'utf-8');

    // Write main.tsx
    const mainTsx = `
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
    fs.writeFileSync(path.join(srcDir, 'main.tsx'), mainTsx, 'utf-8');

    // Write index.html
    const indexHtml = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Consumer Smoke App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
    fs.writeFileSync(path.join(consumerDir, 'index.html'), indexHtml, 'utf-8');

    // Install dependencies in consumer
    console.log(`Running pnpm install in isolated consumer (${label})...`);
    run('pnpm install', consumerDir);

    // Typecheck consumer
    console.log(`Running tsc --noEmit in isolated consumer (${label})...`);
    run('pnpm exec tsc --noEmit', consumerDir);

    // Build production consumer bundle
    console.log(`Running vite build in isolated consumer (${label})...`);
    run('pnpm exec vite build', consumerDir);

    console.log(`✓ Smoke verification passed for: ${label}`);
  }

  // Test 1: React 19 + React-Admin 5.15 + DevExtreme 26.1
  testConsumer('^19.0.0', '^19.0.0', '^19.0.10', '^19.0.4', 'React-19');

  // Test 2: React 18 + React-Admin 5.15 + DevExtreme 26.1
  testConsumer('^18.3.1', '^18.3.1', '^18.3.18', '^18.3.5', 'React-18');

  console.log('\n======================================================');
  console.log('✓ All isolated consumer smoke verifications SUCCEEDED!');
  console.log('======================================================');
} finally {
  // Cleanup
  console.log('\nCleaning up artifacts...');
  if (tarballPath && fs.existsSync(tarballPath)) {
    fs.unlinkSync(tarballPath);
    console.log(`Removed local tarball: ${tarballPath}`);
  }
  if (fs.existsSync(TEMP_BASE)) {
    fs.rmSync(TEMP_BASE, { recursive: true, force: true });
    console.log(`Removed temp consumer directory: ${TEMP_BASE}`);
  }
}
