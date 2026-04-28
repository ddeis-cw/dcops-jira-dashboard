/**
 * build.js — esbuild config for DCOPS Jira Dashboard
 *
 * Builds two bundles:
 *   public/bundle.js     — DCOPSJiraDashboard (main app)
 *   public/mbr-bundle.js — MBRDashboard
 */

const esbuild = require('esbuild');
const fs      = require('fs');

const CDN_GLOBALS = {
  'react':              'React',
  'react-dom':          'ReactDOM',
  'react-dom/client':   'ReactDOM',
  'recharts':           'Recharts',
};

const cdnPlugin = {
  name: 'cdn-globals',
  setup(build) {
    build.onResolve({ filter: /^(react|react-dom|recharts)(\/.*)?$/ }, args => ({
      path:      args.path,
      namespace: 'cdn-globals',
    }));
    build.onLoad({ filter: /.*/, namespace: 'cdn-globals' }, ({ path }) => {
      const global = CDN_GLOBALS[path];
      if (!global) return { contents: 'module.exports = {}', loader: 'js' };
      return {
        contents: `module.exports = globalThis.${global} || {};`,
        loader:   'js',
      };
    });
  },
};

// MBR plugin: only externalize React/ReactDOM, bundle Recharts directly
const mbrPlugin = {
  name: 'cdn-globals-mbr',
  setup(build) {
    build.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({
      path:      args.path,
      namespace: 'cdn-globals',
    }));
    build.onLoad({ filter: /.*/, namespace: 'cdn-globals' }, ({ path }) => {
      const global = CDN_GLOBALS[path];
      if (!global) return { contents: 'module.exports = {}', loader: 'js' };
      return {
        contents: `module.exports = globalThis.${global} || {};`,
        loader:   'js',
      };
    });
  },
};

const shared = {
  bundle:  true,
  format:  'iife',
  define:  { 'process.env.NODE_ENV': '"production"' },
  logLevel:'info',
};

Promise.all([
  esbuild.build({ ...shared, entryPoints: ['public/DCOPSJiraDashboard.jsx'], outfile: 'public/bundle.js',     globalName: 'DCOPSApp', plugins: [cdnPlugin] }),
  esbuild.build({ ...shared, entryPoints: ['public/MBRDashboard.jsx'],       outfile: 'public/mbr-bundle.js', globalName: 'MBRApp',   plugins: [mbrPlugin] }),
]).then(() => {
  const main = fs.statSync('public/bundle.js').size;
  const mbr  = fs.statSync('public/mbr-bundle.js').size;
  console.log(`✓ bundle.js      ${(main/1024).toFixed(1)} KB`);
  console.log(`✓ mbr-bundle.js  ${(mbr/1024).toFixed(1)} KB`);
}).catch(() => process.exit(1));
