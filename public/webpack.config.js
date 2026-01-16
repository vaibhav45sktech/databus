const path = require('path');

module.exports = {
  entry: './js/angular-application.js',
  mode: 'development',
  devtool: 'source-map',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
  },
  externalsType: 'global',
  externals: {
    "moment/moment": "moment",
    "markdown-it": "markdownit"
  }
};