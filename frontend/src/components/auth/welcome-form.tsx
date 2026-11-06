"use client";

import { FormEvent, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon, UserIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError, SubmitButton } from "@/components/auth/form-bits";
import { ProfileFields } from "@/components/auth/profile-fields";
import { announceProfileChanged, Me, useMe, useRequireSignIn } from "@/components/site/account-menu";
import { ApiError, apiJson } from "@/lib/api";
import { dobString, draftFromDob, draftProblem, EMPTY_DRAFT, normalisePhone, ProfileDraft, useProfileOptions } from "@/lib/profile";
import { safeNext } from "@/app/login/login-form";

// The /welcome form. A student with missing details fills them in and goes on
// to `next`; a student with a complete profile can change class, district,
// name and phone here (the date of birth is set once).
export function WelcomeForm() {
  const id = useId();
  const router = useRouter();
  const nextParam = useSearchParams().get("next");
  const next = safeNext(nextParam ?? "/profile");
  useRequireSignIn();
  const me = useMe();
  const { options, error: optionsError } = useProfileOptions();
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Fill the form from the account once it arrives ("previous target" pattern).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (me && loadedFor !== me.id) {
    setLoadedFor(me.id);
    setName(me.name ?? "");
    setDraft({
      classLevelId: me.classLevel?.id ?? "",
      districtId: me.district?.id ?? "",
      ...draftFromDob(me.dateOfBirth),
      phone: me.phone ?? "",
    });
  }

  if (!me || !options) {
    return optionsError ? (
      <FormError message={`We couldn't load the class and district lists. ${optionsError}`} />
    ) : (
      <Loader2Icon className="mx-auto my-8 size-8 animate-spin text-brand-amber-text" aria-label="Loading your details" />
    );
  }

  const dobLocked = Boolean(me.dateOfBirth);
  const askName = !me.name;
  const firstTime = !me.profileComplete;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = askName && !name.trim() ? "Please enter your name." : draftProblem(draft, { needDob: !dobLocked });
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await apiJson<{ user: Me }>("/api/users/me/profile", {
        method: "PATCH",
        json: {
          ...(askName ? { name: name.trim() } : {}),
          classLevelId: draft.classLevelId,
          districtId: draft.districtId,
          ...(dobLocked ? {} : { dateOfBirth: dobString(draft) }),
          phone: draft.phone.trim() ? normalisePhone(draft.phone) : "",
        },
      });
      announceProfileChanged();
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      {firstTime && (
        <p className="rounded-xl bg-accent px-4 py-3 text-[15px] leading-relaxed">
          <strong>One last step{me.name ? `, ${me.name.split(" ")[0]}` : ""}!</strong> Add your class, district and date of birth to start
          learning. It takes a few seconds.
        </p>
      )}
      <FormError message={error} />
      {askName && (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-name`} className="text-sm font-semibold">
            Your name
          </Label>
          <div className="relative">
            <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id={`${id}-name`} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya Das" className="h-12 rounded-xl pl-11 text-base" />
          </div>
        </div>
      )}
      <ProfileFields value={draft} onChange={setDraft} options={options} dobLocked={dobLocked} />
      <SubmitButton loading={saving} loadingText="Saving…">
        {firstTime ? "Save and continue" : "Save changes"}
      </SubmitButton>
      {!firstTime && (
        <button type="button" onClick={() => router.back()} className="mx-auto inline-flex min-h-11 items-center px-4 text-sm font-semibold text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      )}
    </form>
  );
}
