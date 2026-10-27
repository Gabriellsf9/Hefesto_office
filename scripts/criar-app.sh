#!/bin/bash
# Cria "Hefesto.app" (app desktop leve): abre a empresa numa janela própria do Chrome,
# subindo o servidor local se ele ainda não estiver rodando. Depois é só arrastar o app para
# Aplicativos ou para o Dock. (Um app nativo com Tauri precisa do Rust instalado.)
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
APP="$RAIZ/Hefesto.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Hefesto</string>
  <key>CFBundleDisplayName</key><string>Hefesto</string>
  <key>CFBundleIdentifier</key><string>local.hefesto</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Hefesto</string>
  <key>CFBundleIconFile</key><string>Hefesto</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
</dict>
</plist>
PLIST
cp "$RAIZ/scripts/icone/Hefesto.icns" "$APP/Contents/Resources/Hefesto.icns"

cat > "$APP/Contents/MacOS/Hefesto" <<LAUNCHER
#!/bin/bash
# Apps abertos pelo Finder não herdam o PATH do terminal: inclui o Homebrew e o Node.
export PATH="/opt/homebrew/bin:/usr/local/bin:\$PATH"
RAIZ="$RAIZ"
ENDERECO="http://127.0.0.1:4317"
if ! curl -s -o /dev/null "\$ENDERECO/api/status"; then
  mkdir -p "\$RAIZ/data"
  cd "\$RAIZ/apps/server" && nohup ./node_modules/.bin/tsx src/index.ts >> "\$RAIZ/data/app.log" 2>&1 &
  for i in \$(seq 1 60); do
    curl -s -o /dev/null "\$ENDERECO/api/status" && break
    sleep 0.5
  done
fi
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="\$ENDERECO" --window-size=1440,900
else
  open "\$ENDERECO"
fi
LAUNCHER
chmod +x "$APP/Contents/MacOS/Hefesto"
echo "Pronto: $APP"
