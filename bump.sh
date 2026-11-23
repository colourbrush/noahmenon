#!/bin/sh
# Re-stamp cache-busting versions before each publish
V=$(date +%s); cd "$(dirname "$0")/site"
sed -i -E "s#(assets/(style.css|app.js))\?v=[0-9]+#\1?v=$V#g" index.html
sed -i -E "s#(\./(data|sheet|weekly)\.js)\?v=[0-9]+#\1?v=$V#g" assets/app.js
