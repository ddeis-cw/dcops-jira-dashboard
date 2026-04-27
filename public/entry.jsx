// entry.jsx — esbuild entry point
// Re-exports React, ReactDOM, and the App so the IIFE bundle exposes them
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './DCOPSJiraDashboard.jsx';

export { React, ReactDOM, App as default };
