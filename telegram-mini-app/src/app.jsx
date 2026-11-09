const { useState, useMemo, useEffect, useCallback } = React;

// ---------- Telegram WebApp helpers ----------
const tg = window.Telegram ? window.Telegram.WebApp : null;

function haptic(style) {
  if (!tg || !tg.HapticFeedback) return;
  if (style === "light" || style === "medium" || style === "heavy" || style === "rigid" || style === "soft") {
    tg.HapticFeedback.impactOccurred(style);
  } else if (style === "success" || style === "error" || style === "warning") {
    tg.HapticFeedback.notificationOccurred(style);
  } else {
    tg.HapticFeedback.selectionChanged();
  }
}

function formatPrice(value) {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// ---------- Contact (vitrine : les commandes passent par David, pas de paiement en ligne) ----------
const CONTACT_NAME = "David De France";
const CONTACT_PHONE_DISPLAY = "07 81 19 92 98";
const CONTACT_PHONE_TEL = "+33781199298";
const CONTACT_PHONE_WA = "33781199298";

function buildOrderMessage(items, total) {
  if (items.length === 0) {
    return "Bonjour David, j'aimerais avoir des informations sur vos produits olfazeta.";
  }
  const lines = items.map(
    ({ product, qty }) => `• ${product.name} x${qty} — ${formatPrice(product.price * qty)}`
  );
  return `Bonjour David, je souhaite commander :\n${lines.join("\n")}\n\nTotal estimé : ${formatPrice(
    total
  )}\n\nMerci !`;
}

function openLink(url) {
  if (tg && tg.openLink) {
    tg.openLink(url);
  } else {
    window.open(url, "_blank");
  }
}

function callContact() {
  haptic("medium");
  window.location.href = `tel:${CONTACT_PHONE_TEL}`;
}

function whatsappContact(items, total) {
  haptic("medium");
  const url = `https://wa.me/${CONTACT_PHONE_WA}?text=${encodeURIComponent(buildOrderMessage(items, total))}`;
  openLink(url);
}

// ---------- Header ----------
function Header({ query, onQueryChange, onContact }) {
  return (
    <header className="sticky top-0 z-20 bg-[var(--tg-theme-bg-color,#fff)]/95 backdrop-blur border-b border-black/5 dark:border-white/10 px-4 pt-3 pb-3">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--tg-theme-text-color,#111)]">
          Parfums &amp; Accessoires
        </h1>
        <button
          onClick={() => {
            haptic("light");
            onContact();
          }}
          className="shrink-0 flex items-center gap-1.5 rounded-full bg-[var(--tg-theme-secondary-bg-color,#f2f2f7)] text-[var(--tg-theme-link-color,#2481cc)] text-[12.5px] font-semibold px-3 py-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M3 5a2 2 0 0 1 2-2h2.28a1 1 0 0 1 .95.68l1.1 3.3a1 1 0 0 1-.27 1.03L7.6 9.5a11 11 0 0 0 5.9 5.9l1.49-1.46a1 1 0 0 1 1.03-.27l3.3 1.1a1 1 0 0 1 .68.95V18a2 2 0 0 1-2 2A16 16 0 0 1 3 5Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Contact
        </button>
      </div>
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tg-theme-hint-color,#999)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Rechercher un parfum, une marque..."
          className="w-full rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#f2f2f7)] text-[var(--tg-theme-text-color,#111)] text-[15px] pl-9 pr-9 py-2.5 outline-none placeholder:text-[var(--tg-theme-hint-color,#999)]"
        />
        {query && (
          <button
            onClick={() => onQueryChange("")}
            aria-label="Effacer"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/10 dark:bg-white/15 flex items-center justify-center text-[var(--tg-theme-hint-color,#999)]"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}

// ---------- Category tabs ----------
function CategoryTabs({ categories, active, onChange }) {
  return (
    <div className="sticky top-[88px] z-10 bg-[var(--tg-theme-bg-color,#fff)]/95 backdrop-blur border-b border-black/5 dark:border-white/10 px-4 py-2.5 overflow-x-auto no-scrollbar">
      <div className="flex gap-2 w-max">
        {categories.map((cat) => {
          const isActive = cat.id === active;
          return (
            <button
              key={cat.id}
              onClick={() => {
                haptic("selection");
                onChange(cat.id);
              }}
              className={
                "px-4 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors " +
                (isActive
                  ? "bg-[var(--tg-theme-button-color,#2481cc)] text-[var(--tg-theme-button-text-color,#fff)]"
                  : "bg-[var(--tg-theme-secondary-bg-color,#f2f2f7)] text-[var(--tg-theme-text-color,#111)]")
              }
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Category identity (no product photos: a tinted monogram instead) ----------
const CATEGORY_COLORS = {
  femme: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  homme: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  mixte: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  luxe: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  luxury: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  signature: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  maison: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  accessoires: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  enfants: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  coffrets: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function Avatar({ name, category, size }) {
  const palette = CATEGORY_COLORS[category] || "bg-black/5 text-[var(--tg-theme-hint-color,#999)] dark:bg-white/10";
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div className={`flex items-center justify-center rounded-full font-bold shrink-0 ${palette} ${size}`}>
      {initial}
    </div>
  );
}

// ---------- Product row ----------
function ProductRow({ product, onOpen, onQuickAdd }) {
  return (
    <div
      onClick={() => {
        haptic("light");
        onOpen(product);
      }}
      className="w-full flex items-center gap-3 px-4 py-3 active:bg-black/5 dark:active:bg-white/5"
    >
      <Avatar name={product.name} category={product.category} size="w-11 h-11 text-[16px]" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <h3 className="text-[14.5px] font-semibold text-[var(--tg-theme-text-color,#111)] leading-tight">
            {product.name}
          </h3>
          {product.tier && (
            <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--tg-theme-link-color,#2481cc)]">
              {product.tier}
            </span>
          )}
        </div>
        <p className="text-[12px] text-[var(--tg-theme-hint-color,#999)] leading-snug mt-0.5 truncate">
          {product.subtitle}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0 pl-1">
        <span className="text-[14px] font-bold text-[var(--tg-theme-text-color,#111)] whitespace-nowrap">
          {formatPrice(product.price)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            haptic("medium");
            onQuickAdd(product);
          }}
          aria-label="Ajouter"
          className="w-7 h-7 rounded-full bg-[var(--tg-theme-button-color,#2481cc)] text-[var(--tg-theme-button-text-color,#fff)] flex items-center justify-center"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---------- Product list (grouped by category when browsing "Tous") ----------
function ProductList({ products, category, onOpen, onQuickAdd }) {
  if (products.length === 0) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-[14px] text-[var(--tg-theme-hint-color,#999)]">
          Aucun produit ne correspond à votre recherche.
        </p>
      </div>
    );
  }

  if (category !== "tous") {
    return (
      <div className="divide-y divide-black/5 dark:divide-white/10 py-1">
        {products.map((p) => (
          <ProductRow key={p.id} product={p} onOpen={onOpen} onQuickAdd={onQuickAdd} />
        ))}
      </div>
    );
  }

  const groups = window.CATEGORIES.filter((c) => c.id !== "tous")
    .map((c) => ({ ...c, items: products.filter((p) => p.category === c.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="pb-1">
      {groups.map((g) => (
        <div key={g.id}>
          <div className="px-4 pt-4 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--tg-theme-hint-color,#999)]">
            {g.label} <span className="font-normal opacity-70">· {g.items.length}</span>
          </div>
          <div className="divide-y divide-black/5 dark:divide-white/10">
            {g.items.map((p) => (
              <ProductRow key={p.id} product={p} onOpen={onOpen} onQuickAdd={onQuickAdd} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Notes row (perfume pyramid) ----------
function NotesPyramid({ notes }) {
  if (!notes) return null;
  const rows = [
    ["Tête", notes.top],
    ["Cœur", notes.heart],
    ["Fond", notes.base],
  ];
  return (
    <div className="mt-4 divide-y divide-black/5 dark:divide-white/10 border-t border-b border-black/5 dark:border-white/10">
      {rows.map(([label, value]) =>
        value ? (
          <div key={label} className="flex py-2.5 gap-3">
            <span className="w-14 shrink-0 text-[12px] font-semibold uppercase tracking-wide text-[var(--tg-theme-hint-color,#999)]">
              {label}
            </span>
            <span className="text-[13px] text-[var(--tg-theme-text-color,#111)]">{value}</span>
          </div>
        ) : null
      )}
    </div>
  );
}

// ---------- Product detail bottom sheet ----------
function ProductModal({ product, onClose, onAddToCart }) {
  const [qty, setQty] = useState(1);

  useEffect(() => {
    setQty(1);
  }, [product]);

  if (!product) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-h-[88vh] overflow-y-auto bg-[var(--tg-theme-bg-color,#fff)] rounded-t-3xl animate-[slideUp_0.25s_ease-out]">
        <div className="sticky top-0 bg-[var(--tg-theme-bg-color,#fff)] pt-2.5 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-black/15 dark:bg-white/20" />
        </div>
        <div className="px-5 pt-3 pb-32">
          <div className="flex items-start gap-3.5">
            <Avatar name={product.name} category={product.category} size="w-14 h-14 text-[20px] mt-0.5" />
            <div className="flex-1 min-w-0">
              {product.tier && (
                <span className="inline-block mb-0.5 text-[11px] font-semibold tracking-wide uppercase text-[var(--tg-theme-link-color,#2481cc)]">
                  {product.tier}
                </span>
              )}
              <h2 className="text-[19px] font-bold leading-tight text-[var(--tg-theme-text-color,#111)]">
                {product.name}
              </h2>
              <p className="text-[13px] text-[var(--tg-theme-hint-color,#999)] mt-0.5">{product.subtitle}</p>
            </div>
          </div>
          <p className="text-[18px] font-bold text-[var(--tg-theme-text-color,#111)] mt-3">
            {formatPrice(product.price)}
          </p>
          <p className="text-[14px] leading-relaxed text-[var(--tg-theme-text-color,#111)] mt-3">
            {product.description}
          </p>
          <NotesPyramid notes={product.notes} />

          <div className="flex items-center justify-between mt-5">
            <span className="text-[14px] font-medium text-[var(--tg-theme-text-color,#111)]">Quantité</span>
            <div className="flex items-center gap-4 bg-[var(--tg-theme-secondary-bg-color,#f2f2f7)] rounded-full px-1.5 py-1.5">
              <button
                onClick={() => {
                  haptic("light");
                  setQty((q) => Math.max(1, q - 1));
                }}
                className="w-8 h-8 rounded-full bg-[var(--tg-theme-bg-color,#fff)] flex items-center justify-center text-[18px] font-semibold text-[var(--tg-theme-text-color,#111)]"
              >
                −
              </button>
              <span className="w-5 text-center text-[15px] font-semibold text-[var(--tg-theme-text-color,#111)]">
                {qty}
              </span>
              <button
                onClick={() => {
                  haptic("light");
                  setQty((q) => q + 1);
                }}
                className="w-8 h-8 rounded-full bg-[var(--tg-theme-bg-color,#fff)] flex items-center justify-center text-[18px] font-semibold text-[var(--tg-theme-text-color,#111)]"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 px-5 pb-6 pt-3 bg-[var(--tg-theme-bg-color,#fff)] border-t border-black/5 dark:border-white/10">
          <button
            onClick={() => {
              haptic("success");
              onAddToCart(product, qty);
              onClose();
            }}
            className="w-full py-3.5 rounded-2xl bg-[var(--tg-theme-button-color,#2481cc)] text-[var(--tg-theme-button-text-color,#fff)] text-[15px] font-semibold"
          >
            Ajouter à ma sélection · {formatPrice(product.price * qty)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Selection summary bar ----------
function SelectionBar({ itemCount, total, onOpen }) {
  if (itemCount === 0) return null;
  return (
    <button
      onClick={() => {
        haptic("light");
        onOpen();
      }}
      className="fixed bottom-4 left-4 right-4 z-20 rounded-2xl bg-[var(--tg-theme-button-color,#2481cc)] text-[var(--tg-theme-button-text-color,#fff)] px-5 py-3.5 flex items-center justify-between shadow-lg shadow-black/20"
    >
      <span className="flex items-center gap-2 text-[14px] font-semibold">
        <span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[11px]">
          {itemCount}
        </span>
        Voir ma sélection
      </span>
      <span className="text-[14px] font-bold">{formatPrice(total)}</span>
    </button>
  );
}

// ---------- Selection sheet ----------
function SelectionSheet({ open, items, onClose, onChangeQty, onRemove, onContact }) {
  if (!open) return null;
  const total = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-h-[85vh] overflow-y-auto bg-[var(--tg-theme-bg-color,#fff)] rounded-t-3xl animate-[slideUp_0.25s_ease-out]">
        <div className="sticky top-0 bg-[var(--tg-theme-bg-color,#fff)] pt-2.5 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-black/15 dark:bg-white/20" />
        </div>
        <div className="px-5 pt-2 pb-6">
          <h2 className="text-[17px] font-bold text-[var(--tg-theme-text-color,#111)] mb-3">Ma sélection</h2>
          {items.length === 0 && (
            <p className="text-[14px] text-[var(--tg-theme-hint-color,#999)] py-6 text-center">
              Votre sélection est vide.
            </p>
          )}
          <div className="divide-y divide-black/5 dark:divide-white/10">
            {items.map(({ product, qty }) => (
              <div key={product.id} className="py-3 flex gap-3 items-center">
                <Avatar name={product.name} category={product.category} size="w-12 h-12 text-[16px]" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-[var(--tg-theme-text-color,#111)] truncate">
                    {product.name}
                  </p>
                  <p className="text-[12px] text-[var(--tg-theme-hint-color,#999)]">{formatPrice(product.price)}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      onClick={() => onChangeQty(product.id, qty - 1)}
                      className="w-6 h-6 rounded-full bg-[var(--tg-theme-secondary-bg-color,#f2f2f7)] text-[14px] font-semibold text-[var(--tg-theme-text-color,#111)]"
                    >
                      −
                    </button>
                    <span className="text-[13px] font-medium text-[var(--tg-theme-text-color,#111)]">{qty}</span>
                    <button
                      onClick={() => onChangeQty(product.id, qty + 1)}
                      className="w-6 h-6 rounded-full bg-[var(--tg-theme-secondary-bg-color,#f2f2f7)] text-[14px] font-semibold text-[var(--tg-theme-text-color,#111)]"
                    >
                      +
                    </button>
                    <button
                      onClick={() => onRemove(product.id)}
                      className="ml-auto text-[12px] text-red-500 font-medium"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
                <span className="text-[13.5px] font-bold text-[var(--tg-theme-text-color,#111)] shrink-0">
                  {formatPrice(product.price * qty)}
                </span>
              </div>
            ))}
          </div>
          {items.length > 0 && (
            <>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-black/5 dark:border-white/10">
                <span className="text-[15px] font-semibold text-[var(--tg-theme-text-color,#111)]">
                  Total estimé
                </span>
                <span className="text-[17px] font-bold text-[var(--tg-theme-text-color,#111)]">
                  {formatPrice(total)}
                </span>
              </div>
              <button
                onClick={() => {
                  haptic("light");
                  onContact();
                }}
                className="w-full mt-4 py-3.5 rounded-2xl bg-[var(--tg-theme-button-color,#2481cc)] text-[var(--tg-theme-button-text-color,#fff)] text-[15px] font-semibold"
              >
                Commander auprès de David
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Contact sheet (vitrine : la commande se finalise par téléphone / WhatsApp) ----------
function ContactSheet({ open, onClose, items, total }) {
  if (!open) return null;
  const hasItems = items.length > 0;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-[var(--tg-theme-bg-color,#fff)] rounded-t-3xl animate-[slideUp_0.25s_ease-out] px-5 pt-2.5 pb-7">
        <div className="pt-0 pb-3 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-black/15 dark:bg-white/20" />
        </div>
        <h2 className="text-[17px] font-bold text-[var(--tg-theme-text-color,#111)]">
          {hasItems ? "Commander" : "Nous contacter"}
        </h2>
        <p className="text-[13.5px] text-[var(--tg-theme-hint-color,#999)] mt-1 leading-relaxed">
          {hasItems
            ? `Les commandes se font directement auprès de ${CONTACT_NAME}. Appelez-le ou envoyez-lui votre sélection (${items.length} article${items.length > 1 ? "s" : ""} · ${formatPrice(total)}) par WhatsApp.`
            : `Une question sur nos produits ? ${CONTACT_NAME} vous répond.`}
        </p>

        <div className="mt-5 space-y-2.5">
          <button
            onClick={() => whatsappContact(items, total)}
            className="w-full flex items-center gap-3 rounded-2xl bg-[#25D366] text-white px-4 py-3.5"
          >
            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.82L2 22l5.4-1.42a9.9 9.9 0 0 0 4.64 1.18h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0 0 12.04 2Zm0 1.67c2.21 0 4.29.86 5.85 2.42a8.23 8.23 0 0 1 2.42 5.82c0 4.55-3.71 8.25-8.27 8.25a8.3 8.3 0 0 1-4.21-1.15l-.3-.18-3.2.84.86-3.12-.2-.32a8.19 8.19 0 0 1-1.26-4.38c0-4.55 3.71-8.18 8.3-8.18Zm-4.47 4.8c-.17 0-.44.06-.67.32-.23.26-.87.85-.87 2.08s.9 2.41 1.02 2.58c.13.17 1.76 2.8 4.37 3.82 2.16.85 2.6.68 3.07.64.47-.04 1.52-.62 1.73-1.22.21-.6.21-1.11.15-1.22-.06-.11-.23-.17-.47-.3-.25-.13-1.52-.75-1.76-.84-.23-.08-.4-.13-.57.13-.17.26-.66.84-.81 1.01-.15.17-.3.19-.55.06-.26-.13-1.08-.4-2.05-1.27-.76-.68-1.27-1.51-1.42-1.77-.15-.26-.02-.4.11-.53.12-.12.26-.3.4-.45.13-.15.17-.26.26-.43.08-.17.04-.32-.02-.45-.06-.13-.57-1.42-.8-1.94-.2-.5-.42-.44-.57-.45Z" />
            </svg>
            <span className="text-[14.5px] font-semibold">Commander sur WhatsApp</span>
          </button>
          <button
            onClick={callContact}
            className="w-full flex items-center gap-3 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#f2f2f7)] text-[var(--tg-theme-text-color,#111)] px-4 py-3.5"
          >
            <svg className="w-5 h-5 shrink-0 text-[var(--tg-theme-link-color,#2481cc)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M3 5a2 2 0 0 1 2-2h2.28a1 1 0 0 1 .95.68l1.1 3.3a1 1 0 0 1-.27 1.03L7.6 9.5a11 11 0 0 0 5.9 5.9l1.49-1.46a1 1 0 0 1 1.03-.27l3.3 1.1a1 1 0 0 1 .68.95V18a2 2 0 0 1-2 2A16 16 0 0 1 3 5Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[14.5px] font-semibold">Appeler {CONTACT_PHONE_DISPLAY}</span>
          </button>
        </div>

        <p className="text-center text-[12px] text-[var(--tg-theme-hint-color,#999)] mt-4">
          {CONTACT_NAME} · {CONTACT_PHONE_DISPLAY}
        </p>
      </div>
    </div>
  );
}

// ---------- Root App ----------
function App() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("tous");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [cart, setCart] = useState({}); // id -> { product, qty }

  const products = window.PRODUCTS;
  const categories = window.CATEGORIES;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCategory = category === "tous" || p.category === category;
      const matchesQuery =
        !q || p.name.toLowerCase().includes(q) || p.subtitle.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [products, query, category]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const itemCount = cartItems.reduce((sum, i) => sum + i.qty, 0);
  const total = cartItems.reduce((sum, i) => sum + i.product.price * i.qty, 0);

  const addToCart = useCallback((product, qty) => {
    setCart((prev) => {
      const existing = prev[product.id];
      const newQty = (existing ? existing.qty : 0) + qty;
      return { ...prev, [product.id]: { product, qty: newQty } };
    });
  }, []);

  const changeQty = useCallback((id, qty) => {
    setCart((prev) => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { ...prev[id], qty } };
    });
  }, []);

  const removeFromCart = useCallback((id) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!tg) return;
    tg.ready();
    tg.expand();
  }, []);

  // MainButton natif Telegram : ouvre la fiche de contact (pas de paiement en ligne,
  // les commandes se finalisent par téléphone/WhatsApp auprès de David).
  useEffect(() => {
    if (!tg || !tg.MainButton) return;

    if (itemCount === 0) {
      tg.MainButton.hide();
      return;
    }

    tg.MainButton.setText(`Commander · ${formatPrice(total)}`);
    tg.MainButton.show();

    const handleClick = () => {
      haptic("light");
      setContactOpen(true);
    };

    tg.MainButton.onClick(handleClick);
    return () => tg.MainButton.offClick(handleClick);
  }, [itemCount, total]);

  return (
    <div className="min-h-screen pb-28 bg-[var(--tg-theme-bg-color,#fff)]">
      <Header query={query} onQueryChange={setQuery} onContact={() => setContactOpen(true)} />
      <CategoryTabs categories={categories} active={category} onChange={setCategory} />
      <ProductList
        products={filtered}
        category={category}
        onOpen={setSelectedProduct}
        onQuickAdd={(p) => addToCart(p, 1)}
      />
      <SelectionBar itemCount={itemCount} total={total} onOpen={() => setCartOpen(true)} />
      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAddToCart={addToCart} />
      <SelectionSheet
        open={cartOpen}
        items={cartItems}
        onClose={() => setCartOpen(false)}
        onChangeQty={changeQty}
        onRemove={removeFromCart}
        onContact={() => {
          setCartOpen(false);
          setContactOpen(true);
        }}
      />
      <ContactSheet
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        items={cartItems}
        total={total}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
