"use client";

import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Up/down buttons instead of drag-and-drop: reliable on phones and keyboards.
export function ReorderButtons({
  index,
  count,
  onMove,
  disabled,
  label,
}: {
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-8"
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
        aria-label={`Move ${label} up`}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-8"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
        aria-label={`Move ${label} down`}
      >
        <ArrowDownIcon />
      </Button>
    </div>
  );
}
