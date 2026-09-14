import React from 'react';
import ReactDOM from 'react-dom/client';
import 'devextreme/dist/css/dx.light.css';
import { licenseKey } from './devextreme-license';
import config from 'devextreme/core/config';
import './demo.css';
import { App } from './App';

config({ licenseKey });
const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
