# Bot backend — réception des commandes

Petit service Node.js, sans dépendances externes, qui :

- fait du **long polling** sur l'API Telegram (`getUpdates`) — aucun port à exposer publiquement
- écoute les messages `web_app_data` envoyés par la Mini App (`Telegram.WebApp.sendData()`)
- confirme la commande au client
- notifie un chat admin si `ADMIN_CHAT_ID` est renseigné
- journalise chaque commande dans `data/orders.jsonl` (une ligne JSON par commande)

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
  -e ADMIN_CHAT_ID="VOTRE_CHAT_ID_OPTIONNEL" \
  -v /volume1/docker/bot-backend/data:/app/data \
  boutique-bot
```

- `BOT_TOKEN` : obtenu via [@BotFather](https://t.me/BotFather) → `/mybots` → votre bot → **API Token**
- `ADMIN_CHAT_ID` (optionnel) : l'identifiant numérique du chat où vous voulez recevoir une notification
  à chaque nouvelle commande. Pour l'obtenir, envoyez un message à [@userinfobot](https://t.me/userinfobot)
  depuis le compte/chat que vous voulez utiliser comme admin.
- Le volume `data/` persiste les commandes (`orders.jsonl`) même si le conteneur redémarre.

## Vérifier que ça tourne

```bash
sudo docker logs -f boutique-bot
```

Vous devez voir `Bot démarré, long-polling en cours...`. Testez ensuite une vraie commande depuis la
Mini App dans Telegram (bouton "Commander") — le message de confirmation doit arriver dans la
conversation, et une ligne doit apparaître dans `data/orders.jsonl`.

## Lire les commandes reçues

```bash
cat /volume1/docker/bot-backend/data/orders.jsonl
```

Chaque ligne est un objet JSON : `{ "receivedAt", "chatId", "from", "payload": { "items": [...], "total": ... } }`.
