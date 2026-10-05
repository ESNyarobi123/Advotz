"use client";

import { Input, Label } from "@heroui/react";
import type { InputHTMLAttributes } from "react";

/**
 * HeroUI splits a labelled field into `Label` + `Input`; the guest portal
 * repeats that pair for every payment field, so it lives here. `Input` already
 * carries the Advo "large" field radius (16px) through `rounded-field`.
 */
export function FieldInput({
  id,
  label,
  ...props
}: { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}
