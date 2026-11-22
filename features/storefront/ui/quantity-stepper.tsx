"use client";

import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { toast } from "sonner";

import {
  decrementQuantity,
  incrementQuantity,
  MAX_LINE_QUANTITY,
  quantityFromInput,
} from "@/features/storefront/domain/cart";
import { cn } from "@/lib/utils";

import { useCart } from "@/features/storefront/ui/cart-provider";
import { hasHalfUnitOption } from "@/features/storefront/ui/line-pricing";
import {
  trackProductAddedToCart,
  trackProductQuantityDecreased,
  trackProductQuantityIncreased,
} from "@/features/storefront/ui/meta-events";

import type { Product } from "@/features/products/application/list-products";

/**
 * "0,5" alone doesn't say what's being weighed out. For half-unit products
 * (see hasHalfUnitOption) that suffix is "kg" — this codebase's half-unit
 * increment is always half a kilogram, never half a jar or half a package.
 */
function formatQty(product: Product, quantity: number): string {
  const formatted = formatNumber(quantity);
  return hasHalfUnitOption(product) ? `${formatted} kg` : formatted;
}

function formatNumber(quantity: number): string {
  return quantity.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

const roundBtn =
  "shop-press shop-focus flex size-12 shrink-0 items-center justify-center rounded-full [&_svg]:size-6";

/**
 * −/+ control bound to a cart line. Honours the product's step (0.5 kg for
 * cheese/yogurt). 48px buttons with the quantity in large type between them.
 *
 * At the product minimum the "−" would remove the line, so it stops being a
 * minus: it becomes a button that says "Çıkar" in words. The old version
 * swapped the icon to a small trash can and nothing else, which an older
 * shopper read as "one less" and lost the product. Removal is also undoable
 * from the toast it raises — forgiveness instead of a confirmation dialog.
 */
export function QuantityStepper({
  product,
  block = false,
}: {
  product: Product;
  /** Stretch to the container's width (buttons at the edges). */
  block?: boolean;
}) {
  const { getQuantity, setQuantity, removeItem, addItem } = useCart();
  const qty = getQuantity(product.key);

  const handleRemove = () => {
    const removedQty = qty;
    removeItem(product.key);
    // Meta Pixel (no-op without a Pixel ID): reported after the basket changed.
    trackProductQuantityDecreased(product, removedQty, 0);
    toast(`${product.display_name} sepetten çıkarıldı`, {
      action: {
        label: "Geri al",
        onClick: () => {
          addItem(product.key, removedQty);
          trackProductAddedToCart(product, removedQty);
        },
      },
    });
  };

  return (
    <StepperControl
      product={product}
      quantity={qty}
      block={block}
      onChange={(next) => {
        setQuantity(product.key, next);
        if (next > qty) trackProductQuantityIncreased(product, qty, next);
        else trackProductQuantityDecreased(product, qty, next);
      }}
      onRemove={handleRemove}
    />
  );
}

/**
 * The same −/+ control for a quantity that is not in the basket yet: the
 * shopper picks how many first, then presses "Sepete ekle". Nothing to remove
 * here, so at the minimum the "−" is simply disabled.
 */
export function QuantityPicker({
  product,
  quantity,
  onChange,
  block = false,
}: {
  product: Product;
  quantity: number;
  onChange: (next: number) => void;
  block?: boolean;
}) {
  return (
    <StepperControl
      product={product}
      quantity={quantity}
      block={block}
      onChange={onChange}
    />
  );
}

function StepperControl({
  product,
  quantity,
  block,
  onChange,
  onRemove,
}: {
  product: Product;
  quantity: number;
  block: boolean;
  onChange: (next: number) => void;
  /** Given → at the minimum "−" becomes "Çıkar"; omitted → it is disabled. */
  onRemove?: () => void;
}) {
  const atMin = quantity <= product.min_qty;
  const atMax = incrementQuantity(quantity, product.step) > MAX_LINE_QUANTITY;

  return (
    <div
      className={cn(
        "items-center justify-between gap-1 rounded-full border-2 border-(--shop-field-border) bg-card p-1",
        block ? "flex w-full" : "inline-flex",
      )}
    >
      {atMin && onRemove ? (
        <button
          type="button"
          className="shop-press shop-focus flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-4 text-base font-bold text-foreground [&_svg]:size-5"
          onClick={onRemove}
        >
          <Trash2Icon aria-hidden />
          Çıkar
        </button>
      ) : (
        <button
          type="button"
          className={cn(
            roundBtn,
            "bg-secondary text-foreground disabled:pointer-events-none disabled:opacity-40",
          )}
          onClick={() =>
            onChange(decrementQuantity(quantity, product.min_qty, product.step))
          }
          disabled={atMin}
          aria-label="Azalt"
        >
          <MinusIcon aria-hidden strokeWidth={3} />
        </button>
      )}
      <QuantityInput product={product} quantity={quantity} onChange={onChange} />
      <button
        type="button"
        className={cn(
          roundBtn,
          "bg-primary text-primary-foreground disabled:pointer-events-none disabled:opacity-40",
        )}
        onClick={() => onChange(incrementQuantity(quantity, product.step))}
        disabled={atMax}
        aria-label="Artır"
      >
        <PlusIcon aria-hidden strokeWidth={3} />
      </button>
    </div>
  );
}

/**
 * The number between − and +, typeable. While focused it holds whatever the
 * shopper is typing; the cart only changes when they leave the box or press
 * Enter, and then to a legal amount (snapped to the step, at least the
 * minimum — see quantityFromInput). Text that isn't a number puts the old
 * amount back. Escape cancels. Enter never submits a surrounding form: the
 * same control sits inside the checkout form.
 */
function QuantityInput({
  product,
  quantity,
  onChange,
}: {
  product: Product;
  quantity: number;
  onChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const halfUnit = hasHalfUnitOption(product);

  const commit = () => {
    if (draft === null) return;
    const next = quantityFromInput(draft, product.min_qty, product.step);
    setDraft(null);
    if (next !== null && next !== quantity) onChange(next);
  };

  return (
    <span className="flex min-w-0 flex-1 items-center justify-center gap-1">
      <input
        type="text"
        inputMode={halfUnit ? "decimal" : "numeric"}
        enterKeyHint="done"
        autoComplete="off"
        aria-label={halfUnit ? `${product.display_name} miktarı (kg)` : `${product.display_name} adedi`}
        className={cn(
          "shop-money shop-focus w-16 min-w-0 rounded-lg bg-transparent px-1 py-1 text-xl font-bold outline-none focus:bg-secondary",
          // Right-aligned next to its "kg", so it reads "0,5 kg", not "0,5   kg".
          halfUnit ? "text-right" : "text-center",
        )}
        value={draft ?? formatNumber(quantity)}
        onFocus={(e) => {
          setDraft(formatNumber(quantity));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            // Back to the current amount; nothing to commit on the next blur.
            setDraft(null);
          }
        }}
      />
      {halfUnit ? (
        <span className="text-xl font-bold" aria-hidden>
          kg
        </span>
      ) : null}
      {/* The box no longer announces −/+ presses on its own. */}
      <span className="sr-only" aria-live="polite">
        {formatQty(product, quantity)}
      </span>
    </span>
  );
}
