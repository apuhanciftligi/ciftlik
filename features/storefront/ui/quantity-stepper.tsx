"use client";

import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { toast } from "sonner";

import {
  decrementQuantity,
  incrementQuantity,
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
  const formatted = quantity.toLocaleString("tr-TR", {
    maximumFractionDigits: 2,
  });
  return hasHalfUnitOption(product) ? `${formatted} kg` : formatted;
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
      <span
        className="shop-money min-w-16 px-1 text-center text-xl font-bold whitespace-nowrap"
        aria-live="polite"
      >
        {formatQty(product, quantity)}
      </span>
      <button
        type="button"
        className={cn(roundBtn, "bg-primary text-primary-foreground")}
        onClick={() => onChange(incrementQuantity(quantity, product.step))}
        aria-label="Artır"
      >
        <PlusIcon aria-hidden strokeWidth={3} />
      </button>
    </div>
  );
}
