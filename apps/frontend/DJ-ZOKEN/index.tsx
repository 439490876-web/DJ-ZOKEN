import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme.css';
import { getStoredTheme } from './services/themeStorage';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

getStoredTheme();

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
