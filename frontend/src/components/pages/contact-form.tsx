"use client";

import { useEffect, useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2Icon, Loader2Icon, SendIcon, UserCheckIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/auth/form-bits";
import { useMe } from "@/components/site/account-menu";
import { ApiError, apiJson } from "@/lib/api";
import { CONTACT_TOPICS, ContactValues, contactSchema, MESSAGE_MAX, toPayload } from "@/lib/contact";
import { cn } from "@/lib/utils";

const field = "h-12 rounded-xl text-base";
const invalid = "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm font-medium text-destructive">
      {message}
    </p>
  );
}

// Contact form (React Hook Form + Zod; the server validates again). The
// message is saved and the student sees "sent" right away; the email to the
// team goes out in the background on the server.
export function ContactForm({ email }: { email: string }) {
  const id = useId();
  const me = useMe();
  const [sent, setSent] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", email: "", phone: "", topic: undefined, message: "", website: "" },
    mode: "onTouched",
  });

  // Signed in: fill in what we already know (without overwriting typing).
  useEffect(() => {
    if (!me) return;
    if (!getValues("name") && me.name) setValue("name", me.name);
    if (!getValues("email")) setValue("email", me.email);
    if (!getValues("phone") && me.phone) setValue("phone", me.phone);
  }, [me, getValues, setValue]);

  const length = useWatch({ control, name: "message" })?.length ?? 0;

  const onSubmit = async (values: ContactValues) => {
    setServerError(null);
    try {
      await apiJson("/api/content/contact", { method: "POST", json: toPayload(values) });
      setSent(values.name.split(" ")[0]);
      reset({ name: values.name, email: values.email, phone: values.phone, topic: undefined, message: "", website: "" });
    } catch (err) {
      const e = err as ApiError;
      setServerError(e.status === 429 ? e.message : e.status === 0 ? e.message : `Sorry, that didn't go through. ${e.message}`);
    }
  };

  if (sent) {
    return (
      <div role="status" className="grid justify-items-center gap-3 px-2 py-8 text-center">
        <CheckCircle2Icon className="size-14 text-success" aria-hidden="true" />
        <p className="font-heading text-2xl font-extrabold">Thank you, {sent}!</p>
        <p className="max-w-sm text-muted-foreground">
          We&apos;ve got your message and will reply by email. If it&apos;s urgent you can also write to{" "}
          <a href={`mailto:${email}`} className="font-semibold text-brand-amber-text underline">
            {email}
          </a>
          .
        </p>
        <button type="button" onClick={() => setSent(null)} className="mt-2 inline-flex min-h-11 items-center rounded-xl border bg-card px-5 font-semibold transition hover:bg-accent">
          Send another message
        </button>
      </div>
    );
  }

  const describe = (name: keyof ContactValues, hint?: string) => [errors[name] ? `${id}-${name}-err` : null, hint].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <FormError message={serverError} />
      {me && (
        // Only signed-in students get details filled in, and only their own.
        <p className="flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-sm">
          <UserCheckIcon className="size-4 shrink-0 text-brand-amber-text" aria-hidden="true" />
          We&apos;ve filled in your details from your account. You can change them.
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-name`} className="text-sm font-semibold">
            Your name
          </Label>
          <Input id={`${id}-name`} autoComplete="name" placeholder="Your full name" aria-invalid={Boolean(errors.name)} aria-describedby={describe("name")} className={cn(field, invalid)} {...register("name")} />
          <FieldError id={`${id}-name-err`} message={errors.name?.message} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-email`} className="text-sm font-semibold">
            Email
          </Label>
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describe("email", `${id}-email-hint`)}
            className={cn(field, invalid)}
            {...register("email")}
          />
          <p id={`${id}-email-hint`} className="text-xs text-muted-foreground">
            We reply to this address.
          </p>
          <FieldError id={`${id}-email-err`} message={errors.email?.message} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-phone`} className="text-sm font-semibold">
            Mobile number <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={`${id}-phone`}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="10-digit mobile number"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={describe("phone")}
            className={cn(field, invalid, "tabular-nums")}
            {...register("phone")}
          />
          <FieldError id={`${id}-phone-err`} message={errors.phone?.message} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-topic`} className="text-sm font-semibold">
            What is it about?
          </Label>
          <select
            id={`${id}-topic`}
            defaultValue=""
            aria-invalid={Boolean(errors.topic)}
            aria-describedby={describe("topic")}
            className={cn(
              "h-12 w-full appearance-none rounded-xl border border-input bg-transparent bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat px-3 pr-10 text-base shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239a5208%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
              invalid
            )}
            {...register("topic")}
          >
            <option value="" disabled>
              Choose a topic
            </option>
            {CONTACT_TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <FieldError id={`${id}-topic-err`} message={errors.topic?.message} />
        </div>
      </div>

      <div className="grid content-start gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={`${id}-message`} className="text-sm font-semibold">
            Your message
          </Label>
          <span className={cn("text-xs tabular-nums", length > MESSAGE_MAX ? "font-semibold text-destructive" : "text-muted-foreground")} aria-live="polite">
            {length}/{MESSAGE_MAX}
          </span>
        </div>
        <textarea
          id={`${id}-message`}
          rows={6}
          placeholder="Tell us how we can help. For a payment, add the order ID from My profile."
          aria-invalid={Boolean(errors.message)}
          aria-describedby={describe("message")}
          className={cn(
            "min-h-36 w-full rounded-xl border border-input bg-transparent px-3 py-3 text-base shadow-xs outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            invalid
          )}
          {...register("message")}
        />
        <FieldError id={`${id}-message-err`} message={errors.message?.message} />
      </div>

      {/* Spam trap: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">We only use these details to answer you. Never share passwords or card numbers.</p>
        <button type="submit" disabled={isSubmitting} className="press-3d inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-6 text-base font-bold disabled:opacity-70">
          {isSubmitting ? <Loader2Icon className="size-5 animate-spin" /> : <SendIcon className="size-5" />}
          {isSubmitting ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
