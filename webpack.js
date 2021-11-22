/* eslint-env node */
const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: {
    'loader': path.join(__dirname, 'src', 'loader.js'),
    'pdfdraw': path.join(__dirname, 'src', 'pdfdraw.js'),
    'admin/backend': path.join(__dirname, 'src', 'admin', 'backend.js'),
    'pdf.worker': path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.js'),
  },
  externals: {
    "pdfjs-dist-viewer-min": "window",
    "pdfjs-dist": "window",
  },
  output: {
    filename: '[name].js',
    path: __dirname + '/js',
  },
  optimization: {
    minimizer: [new TerserPlugin({
      extractComments: false,
    })],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "node_modules/pdfjs-dist/cmaps/", to: "../3rdparty/pdfjs/web/cmaps/" },
        { from: "node_modules/pdfjs-dist-viewer-min/build/minified/web/viewer.css", to: "../3rdparty/pdfjs/web/viewer.css" },
        { from: "node_modules/pdfjs-dist-viewer-min/build/minified/web/images/", to: "../3rdparty/pdfjs/web/images/" },
        { from: "node_modules/pdfjs-dist-viewer-min/build/minified/web/locale/", to: "../3rdparty/pdfjs/web/locale/" },
        { from: "node_modules/pdfjs-dist-viewer-min/build/minified/web/pdf.viewer.js", to: "pdf.viewer.js" },
      ],
    }),
  ],
};
