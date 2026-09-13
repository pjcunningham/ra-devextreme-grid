import React from 'react';
import ReactDOM from 'react-dom/client';
import 'devextreme/dist/css/dx.light.css';
import './demo.css';
import { App } from './App';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
