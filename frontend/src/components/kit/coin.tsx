import { cn } from "@/lib/utils";

// The mock's 3D coin: radial gold gradient, drop shadow, top highlight.
export function Coin3D({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full font-heading text-base font-extrabold text-[#6b4400]",
        "bg-[radial-gradient(circle_at_32%_28%,#fff0c4,#c9780c_85%)] shadow-[0_4px_8px_rgb(0_0_0/0.3),inset_0_1px_2px_rgb(255_255_255/0.5)]",
        className
      )}
    >
      ★
    </span>
  );
}
