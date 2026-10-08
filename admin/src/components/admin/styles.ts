// Shared class strings for the admin's touch-friendly, "3D" look.

// Primary action: the login page's pressable button.
export const pressable =
  "h-10 px-4 font-semibold shadow-[0_3px_0_color-mix(in_oklch,var(--primary),black_35%)] transition-[transform,box-shadow] active:translate-y-[2px] active:shadow-[0_1px_0_color-mix(in_oklch,var(--primary),black_35%)]";

// Secondary actions at the same height.
export const actionButton = "h-10 px-4";

// 40px inputs (shadcn Nova defaults to 32px — too small for touch).
export const inputClass = "h-10";

// Settings forms: a lifted card.
export const formCard = "shadow-[0_1px_0_var(--border),0_12px_32px_-18px_rgba(31,29,74,.35)]";
