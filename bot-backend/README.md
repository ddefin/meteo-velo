# Bot backend — réception des commandes

Petit service Node.js, sans dépendances externes, qui :

- fait du **long polling** sur l'API Telegram (`getUpdates`) — aucun port à exposer publiquement
- répond à `/start` avec un bouton clavier "🛍️ Ouvrir la boutique" qui ouvre la Mini App
- écoute les messages `web_app_data` envoyés par la Mini App (`Telegram.WebApp.sendData()`)
- confirme la commande au client
- notifie un chat admin si `ADMIN_CHAT_ID` est renseigné
- journalise chaque commande dans `data/orders.jsonl` (une ligne JSON par commande)

> ⚠️ **Important** : `Telegram.WebApp.sendData()` ne fonctionne que si la Mini App a été ouverte via
> un **bouton clavier** (`Keyboard button` avec `web_app`), pas via le bouton **Menu** de BotFather —
> Telegram ne sait alors pas à quelle conversation rattacher les données envoyées. C'est pour ça que
> ce bot répond à `/start` avec son propre bouton clavier : c'est par ce bouton qu'il faut ouvrir la
> boutique pour que le checkout fonctionne (le bouton Menu reste utilisable pour simplement parcourir
> le catalogue, mais sans envoi de commande).

## Déploiement sur le NAS (Container Manager / Docker)

Récupérer le code (même méthode que pour la Mini App, sans `git`) :

```bash
cd /volume1/docker
curl -L -o source.tar.gz https://github.com/ddefin/meteo-velo/archive/refs/heads/claude/lucid-brahmagupta-46kns4.tar.gz
tar xzf source.tar.gz
mkdir -p bot-backend
cp -r meteo-velo-*/bot-backend/* bot-backend/
rm -rf source.tar.gz meteo-velo-*
```

Construire l'image et lancer le conteneur :

```bash
cd /volume1/docker/bot-backend
sudo docker build -t boutique-bot .
sudo docker run -d \
  --name boutique-bot \
  --restart unless-stopped \
  -e BOT_TOKEN="VOTRE_TOKEN_BOTFATHER" \
  -e MINI_APP_URL="https://boutique.votre-domaine/" \
  -e ADMIN_CHAT_ID="VOTRE_CHAT_ID_OPTIONNEL" \
  -v /volume1/docker/bot-backend/data:/app/data \
  boutique-bot
```

- `BOT_TOKEN` : obtenu via [@BotFather](https://t.me/BotFather) → `/mybots` → votre bot → **API Token**
- `MINI_APP_URL` : l'URL HTTPS publique de la Mini App (celle configurée dans le bouton Menu de
  BotFather)
- `ADMIN_CHAT_ID` (optionnel) : un ou plusieurs identifiants numériques de chat où recevoir une
  notification à chaque nouvelle commande, séparés par des virgules si plusieurs
  (ex: `"1189289302,114089989"`). Pour obtenir un ID, envoyez un message à
  [@userinfobot](https://t.me/userinfobot) depuis le compte/chat concerné.
- Le volume `data/` persiste les commandes (`orders.jsonl`) même si le conteneur redémarre.

## Vérifier que ça tourne

```bash
sudo docker logs -f boutique-bot
```

Vous devez voir `Bot démarré, long-polling en cours...`. Dans Telegram, envoyez `/start` à votre bot,
appuyez sur le bouton clavier **"🛍️ Ouvrir la boutique"** (pas le bouton Menu), passez une commande —
le message de confirmation doit arriver dans la conversation, et une ligne doit apparaître dans
`data/orders.jsonl`.

## Lire les commandes reçues

```bash
cat /volume1/docker/bot-backend/data/orders.jsonl
```

Chaque ligne est un objet JSON : `{ "receivedAt", "chatId", "from", "payload": { "items": [...], "total": ... } }`.
