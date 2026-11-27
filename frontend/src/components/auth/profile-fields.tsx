"use client";

import { useId } from "react";
import { CheckIcon, LockIcon, PhoneIcon } from "lucide-react";
import { GENDER_LABEL, GenderAvatar, type Gender } from "@/components/kit/gender-avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { birthYears, MONTHS, ProfileDraft, ProfileOptions, validPhone } from "@/lib/profile";
import { cn } from "@/lib/utils";

// Native selects: the phone's own picker, big and easy for young students.
export const selectClass = cn(
  "h-12 w-full appearance-none rounded-xl border border-input bg-transparent bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat px-3 pr-10 text-base shadow-xs outline-none transition",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
  "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239a5208%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
  "dark:bg-input/30"
);

function Select({ id, value, onChange, placeholder, children, label, disabled }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <select id={id} value={value} aria-label={label} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cn(selectClass, !value && "text-muted-foreground")}>
      <option value="" disabled>
        {placeholder}
      </option>
      {children}
    </select>
  );
}

const GENDERS: Gender[] = ["MALE", "FEMALE", "OTHER"];

// Three big cards with the avatar each choice gives. Real radio buttons
// underneath, so arrow keys and screen readers work as usual.
function GenderPicker({ value, onChange }: { value: Gender | ""; onChange: (g: Gender) => void }) {
  const id = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-semibold">I am</legend>
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {GENDERS.map((g) => {
          const checked = value === g;
          return (
            <label
              key={g}
              className={cn(
                "card-3d relative flex min-h-28 cursor-pointer select-none flex-col items-center justify-center gap-2 rounded-2xl px-2 py-3 transition",
                "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                checked ? "bg-accent ring-2 ring-primary" : "hover:bg-accent/50"
              )}
            >
              <input type="radio" name={`${id}-gender`} value={g} checked={checked} onChange={() => onChange(g)} className="peer sr-only" />
              <GenderAvatar gender={g} className={cn("size-14 rounded-xl transition sm:size-16", checked && "motion-safe:scale-105")} />
              <span className={cn("text-[15px] font-semibold", checked && "text-brand-amber-text")}>{GENDER_LABEL[g]}</span>
              {checked && (
                <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-primary text-brand-ink" aria-hidden="true">
                  <CheckIcon className="size-4" strokeWidth={3} />
                </span>
              )}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">This picks your avatar. You can change it later.</p>
    </fieldset>
  );
}

// Gender, class, district, date of birth and (optional) mobile number. Used by the
// sign-up form and "complete your profile". `dobLocked`: the date of birth is
// already saved and can only be corrected through the Helpline.
export function ProfileFields({ value, onChange, options, dobLocked = false, showPhone = true }: {
  value: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
  options: ProfileOptions;
  dobLocked?: boolean;
  showPhone?: boolean;
}) {
  const id = useId();
  const set = (patch: Partial<ProfileDraft>) => onChange({ ...value, ...patch });
  const phoneWrong = value.phone.replace(/\D/g, "").length >= 10 && !validPhone(value.phone);

  return (
    <>
      <GenderPicker value={value.gender} onChange={(gender) => set({ gender })} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-class`} className="text-sm font-semibold">
            Your class
          </Label>
          <Select id={`${id}-class`} value={value.classLevelId} onChange={(classLevelId) => set({ classLevelId })} placeholder="Choose your class">
            {options.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nativeName ? `${c.name} (${c.nativeName})` : c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-district`} className="text-sm font-semibold">
            Your district
          </Label>
          <Select id={`${id}-district`} value={value.districtId} onChange={(districtId) => set({ districtId })} placeholder="Choose your district">
            {options.districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nativeName ? `${d.name} (${d.nativeName})` : d.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <fieldset className="grid gap-2" aria-describedby={`${id}-dob-hint`}>
        <legend className="mb-2 text-sm font-semibold">Date of birth</legend>
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
          <Select id={`${id}-day`} label="Day" value={value.day} onChange={(day) => set({ day })} placeholder="Day" disabled={dobLocked}>
            {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <Select id={`${id}-month`} label="Month" value={value.month} onChange={(month) => set({ month })} placeholder="Month" disabled={dobLocked}>
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1)}>
                {m}
              </option>
            ))}
          </Select>
          <Select id={`${id}-year`} label="Year" value={value.year} onChange={(year) => set({ year })} placeholder="Year" disabled={dobLocked}>
            {birthYears().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <p id={`${id}-dob-hint`} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          {dobLocked ? (
            <>
              <LockIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" /> Saved. To correct it, write to us from the Helpline.
            </>
          ) : (
            "We only use it to know whether you are under 18."
          )}
        </p>
      </fieldset>

      {showPhone && (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-phone`} className="text-sm font-semibold">
            Mobile number <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <div className="relative">
            <PhoneIcon className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <span className="pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 text-base text-muted-foreground" aria-hidden="true">
              +91
            </span>
            <Input
              id={`${id}-phone`}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={value.phone}
              onChange={(e) => set({ phone: e.target.value.replace(/[^\d\s+()-]/g, "") })}
              placeholder="98765 43210"
              maxLength={16}
              aria-invalid={phoneWrong ? true : undefined}
              className="h-12 rounded-xl pl-[4.75rem] text-base tabular-nums"
            />
          </div>
        </div>
      )}
    </>
  );
}
