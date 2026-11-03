#!/bin/sh
# Installe Live Tracker sur le serveur (Debian/Ubuntu + systemd). À lancer depuis le dossier live-tracker/ :
#   sudo sh deploy/install.sh
# Idempotent : relançable pour mettre à jour le code (le jeton et les données sont conservés).
set -eu
[ "$(id -u)" = 0 ] || { echo "Lancer avec sudo." >&2; exit 1; }
command -v node >/dev/null || { echo "Node.js ≥ 18 requis (apt install nodejs)." >&2; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || { echo "Node.js ≥ 18 requis." >&2; exit 1; }
SRC=$(cd "$(dirname "$0")/.." && pwd); DEST=/opt/live-tracker

id live-tracker >/dev/null 2>&1 || useradd --system --home "$DEST" --shell /usr/sbin/nologin live-tracker
mkdir -p "$DEST/data"
# code (hors node_modules, tests, données vivantes) ; on garde route.gpx / mock.json fournis
for f in index.html tracker.html server.mjs css js vendor; do rm -rf "$DEST/$f"; cp -r "$SRC/$f" "$DEST/$f"; done
cp -n "$SRC/data/route.gpx" "$DEST/data/route.gpx"; cp -n "$SRC/data/mock.json" "$DEST/data/mock.json"
chown -R root:root "$DEST"; chown -R live-tracker:live-tracker "$DEST/data"

if [ ! -f /etc/live-tracker.env ]; then
  TOKEN=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  printf 'PORT=8080\nINGEST_TOKEN=%s\n' "$TOKEN" > /etc/live-tracker.env
  chmod 600 /etc/live-tracker.env
  echo "Jeton généré (à saisir dans tracker.html) : $TOKEN"
fi
cp "$SRC/deploy/live-tracker.service" /etc/systemd/system/live-tracker.service
systemctl daemon-reload && systemctl enable --now live-tracker && systemctl restart live-tracker
sleep 1; systemctl --no-pager --lines=3 status live-tracker || true
echo "OK → http://127.0.0.1:8080 . Étape suivante : nginx (deploy/nginx.conf) + HTTPS (certbot)."
echo "Parcours : remplacer $DEST/data/route.gpx par votre GPX ; nom/athlète : voir README."
