/**
 * Application entry point.
 *
 * Deliberately thin: mount the app inside an error boundary and get out of the way.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/patrick-hand/latin-400.css';
import './ui/tokens.css';
import './ui/sketch.css';

import EcuLab from './ui/EcuLab.jsx';
import { ErrorBoundary } from './ui/ErrorBoundary.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <EcuLab blankStart />
    </ErrorBoundary>
  </React.StrictMode>,
);
