/**
 * build.js — esbuild config for DCOPS Jira Dashboard
 *
 * Maps npm package imports to CDN globals loaded in index.html:
 *   react       → window.React
 *   react-dom   → window.ReactDOM
 *   recharts    → window.Recharts
 *
 * This avoids bundling React/Recharts (saves ~3MB) while still
 * compiling the JSX correctly.
 */

const esbuild = require('esbuild');

const CDN_GLOBALS = {
  'react':              'React',
  'react-dom':          'ReactDOM',
  'react-dom/client':   'ReactDOM',
  'recharts':           'Recharts',
};

esbuild.build({
  entryPoints: ['public/DCOPSJiraDashboard.jsx'],
  bundle:      true,
  outfile:     'public/bundle.js',
  format:      'iife',
  globalName:  'DCOPSApp',
  define:      { 'process.env.NODE_ENV': '"production"' },
  logLevel:    'info',
  plugins: [{
    name: 'cdn-globals',
    setup(build) {
      // Intercept all imports that map to CDN globals
      build.onResolve({ filter: /^(react|react-dom|recharts)(\/.*)?$/ }, args => ({
        path:      args.path,
        namespace: 'cdn-globals',
      }));
      // Return a stub that exposes the global
      build.onLoad({ filter: /.*/, namespace: 'cdn-globals' }, ({ path }) => {
        const global = CDN_GLOBALS[path];
        if (!global) return { contents: 'module.exports = {}', loader: 'js' };
        return {
          contents: `module.exports = globalThis.${global} || {};`,
          loader:   'js',
        };
      });
    },
  }],
}).then(result => {
  const fs   = require('fs');
  const size = fs.statSync('public/bundle.js').size;
  console.log(`✓ bundle.js  ${(size / 1024).toFixed(1)} KB`);
}).catch(() => process.exit(1));
