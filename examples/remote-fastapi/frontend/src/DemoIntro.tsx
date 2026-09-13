import React, { useEffect, useState } from 'react';
import type { GetGridParams } from '../../../../src/index';
import { onGridRequest } from './dataProvider';

const links = [
  ['GitHub', 'https://github.com/pjcunningham/ra-devextreme-grid'],
  [
    'Source code',
    'https://github.com/pjcunningham/ra-devextreme-grid/tree/main/examples/remote-fastapi',
  ],
  ['npm package', 'https://www.npmjs.com/package/ra-devextreme-grid'],
  ['Sponsors', 'https://github.com/sponsors/pjcunningham'],
] as const;

export function DemoIntro(): React.JSX.Element {
  const [lastRequest, setLastRequest] = useState<GetGridParams['loadOptions'] | null>(null);

  useEffect(() => onGridRequest(setLastRequest), []);

  return (
    <section className="demo-intro" aria-labelledby="demo-title">
      <h1 id="demo-title">ra-devextreme-grid live demo</h1>
      <p>
        This is a real <code>DatagridDXRemote</code> instance backed by FastAPI, SQLModel,
        SQLAlchemy and SQLite. <strong>All demo data is synthetic.</strong>
      </p>
      <nav className="demo-links" aria-label="Project links">
        {links.map(([label, href]) => (
          <a key={href} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        ))}
      </nav>
      <details className="request-inspector">
        <summary>Latest getGrid() request</summary>
        <pre>{lastRequest ? JSON.stringify(lastRequest, null, 2) : 'Waiting for the grid…'}</pre>
      </details>
    </section>
  );
}
