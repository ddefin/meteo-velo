# Parfums & Accessoires — Telegram Mini App

A premium, zero-build e-commerce Mini App for a perfume/fragrance boutique: search, category
filters, product grid, bottom-sheet product detail with notes pyramid, cart, and native Telegram
checkout via `MainButton`.

## Structure

```
telegram-mini-app/
├── index.html          # Entry point: loads Telegram SDK, Tailwind, React, Babel, and the app
├── src/
│   ├── app.jsx          # All React components (Header, CategoryTabs, ProductGrid,
│   │                     #   ProductModal, CartBar, CartSheet, App) + Telegram SDK wiring
│   └── data/
│       └── products.js  # Product catalog (swap for your API/CMS feed)
└── README.md
```

## How it works

- **No build step**: React, ReactDOM and Babel Standalone are loaded from CDN and JSX is compiled
  in the browser via `<script type="text/babel">`. This lets you deploy by hosting these 3 static
  files anywhere (GitHub Pages, Vercel, Cloudflare Pages, Netlify, your own server over HTTPS).
- **Theme matching**: `index.html` reads `Telegram.WebApp.themeParams` and writes them as CSS
  custom properties (`--tg-theme-bg-color`, `--tg-theme-text-color`, `--tg-theme-button-color`,
  etc.) on `<html>`, which every component consumes via `var(--tg-theme-*, fallback)`. It also
  listens for `themeChanged` so the UI follows light/dark switches live.
- **Haptics**: every tap (category switch, quick-add, quantity +/-, add-to-cart) calls
  `Telegram.WebApp.HapticFeedback` through the `haptic()` helper in `app.jsx`.
- **MainButton checkout**: whenever the cart is non-empty, the native Telegram `MainButton` is
  shown with the label `Commander · <total>`. Tapping it opens `Telegram.showConfirm(...)` and, on
  confirmation, calls `Telegram.WebApp.sendData(JSON.stringify(payload))` with:
  ```json
  { "items": [{ "id": "007", "name": "J'Adore", "qty": 2, "price": 35.0 }], "total": 70.0 }
  ```
  Your bot's backend receives this via the `web_app_data` update and can create the order.
- **Image fallback**: `ProductImage` swaps to a placeholder icon automatically if `product.image`
  is empty or fails to load, so a missing photo never breaks a card.

## Wiring up the Telegram bot

1. Host these 3 files over HTTPS (any static host works — GitHub Pages is the easiest to start).
2. In BotFather: `/mybots` → your bot → **Bot Settings → Menu Button → Configure Menu Button**,
   and set the URL to your hosted `index.html`. Or use an inline keyboard button of type
   `web_app: { url: "https://your-domain/index.html" }` from your bot backend.
3. Listen for `web_app_data` updates in your bot backend (Telegram Bot API) to receive the cart
   payload sent by `sendData()` and turn it into an order / invoice.

## Customizing the catalog

Edit `src/data/products.js`. Each product:

```js
{
  id: "007",                 // unique string, used as cart key
  name: "J'Adore",
  category: "parfums",       // must match a CategoryTabs id: "parfums" | "accessoires" | "coffrets"
  tier: "Luxe",               // optional badge, e.g. "Luxe" / "Luxury"
  subtitle: "Inspiré de Dior · Eau de Parfum · 50ml",
  price: 35.0,
  image: "https://.../photo.jpg", // leave "" to use the placeholder
  notes: { top: "...", heart: "...", base: "..." }, // optional, shown as a pyramid
  description: "...",
}
```

To filter/search against a live backend instead of the static array, replace the `useMemo` filter
in `App` (in `app.jsx`) with a `fetch()` call, or pre-load `window.PRODUCTS` from your API before
mounting.

## Moving to a real build pipeline (optional)

The CDN/Babel setup is ideal for getting started fast and for simple deployments. If you later
want a production React build (code-splitting, smaller bundles, TypeScript, npm packages), the
components in `app.jsx` port almost 1:1 into a Vite + React project:

```bash
npm create vite@latest parfums-twa -- --template react
cd parfums-twa
npm install @twa-dev/sdk
```

Replace the `window.Telegram.WebApp` global with the SDK import:

```js
import WebApp from "@twa-dev/sdk";
// WebApp.ready(), WebApp.HapticFeedback, WebApp.MainButton, etc. — same API surface.
```

Then split `app.jsx` into one file per component under `src/components/`, move
`src/data/products.js` to `src/data/products.js` (unchanged), and replace the Tailwind CDN
`<script>` with `npm install -D tailwindcss` + a standard Tailwind build.

## Local preview (outside Telegram)

Opening `index.html` directly in a browser works too — `window.Telegram` is simply `undefined`
outside Telegram, and every Telegram call is guarded (`if (!tg) return`), so the shop still
renders and functions (minus theme sync, haptics, and the native checkout button). Serve it over
a local static server rather than `file://` so module/script loading behaves consistently:

```bash
cd telegram-mini-app
python3 -m http.server 8080
# open http://localhost:8080
```
