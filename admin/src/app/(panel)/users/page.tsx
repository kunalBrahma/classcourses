"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, CoinsIcon, SearchIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/page-header";
import { formCard } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { CONSENT_BADGE, formatDate, formatPhone, initials, profileLine, STATUS_BADGE, UserRow } from "@/lib/people";
import { UnverifiedBadge } from "@/components/admin/unverified-badge";

interface Page {
  users: UserRow[];
  total: number;
  page: number;
  totalPages: number;
}

const PAGE_SIZE = 25;
const ALL = "all";

// Class / district / profile filters, kept in the URL like the rest.
// India calendar days (YYYY-MM-DD) for the "Joined" filter; the API counts them in IST.
const istDay = (offsetDays = 0) => new Date(Date.now() + 5.5 * 3_600_000 - offsetDays * 86_400_000).toISOString().slice(0, 10);
const joinedRange = (value: string): { from?: string; to?: string } => {
  if (value === "today") return { from: istDay() };
  if (value === "7" || value === "30" || value === "90") return { from: istDay(Number(value) - 1) };
  if (value === "this-year") return { from: `${istDay().slice(0, 4)}-01-01` };
  if (value === "before-this-year") return { to: `${Number(istDay().slice(0, 4)) - 1}-12-31` };
  return {};
};

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-10 w-full sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function IncompleteBadge() {
  return (
    <Badge variant="outline" className="h-5 border-warning/40 bg-warning/10 px-1.5 text-[10px] text-warning" title="Class, district or date of birth missing">
      Needs details
    </Badge>
  );
}

function UsersList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const role = params.get("role") ?? "all";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = params.get("q") ?? "";
  const classFilter = params.get("class") ?? ALL;
  const districtFilter = params.get("district") ?? ALL;
  const profileFilter = params.get("profile") ?? ALL;
  const statusFilter = params.get("status") ?? ALL;
  const consentFilter = params.get("consent") ?? ALL;
  const joinedFilter = params.get("joined") ?? ALL;
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: string; name: string; isActive: boolean }[]>([]);

  const [search, setSearch] = useState(query);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") q.delete(k);
      else q.set(k, v);
    }
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  // Debounce typing → URL (which triggers the fetch below).
  useEffect(() => {
    if (search === query) return;
    const t = setTimeout(() => update({ q: search.trim() || null, page: null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  // Filter choices (hidden ones too: older students may have them).
  useEffect(() => {
    apiJson<{ classes: { id: string; name: string }[] }>("/api/admin/classes").then((r) => setClasses(r.classes)).catch(() => undefined);
    apiJson<{ districts: { id: string; name: string; isActive: boolean }[] }>("/api/admin/districts").then((r) => setDistricts(r.districts)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (role !== "all") q.set("role", role);
    if (query) q.set("search", query);
    if (classFilter !== ALL) q.set("classLevelId", classFilter);
    if (districtFilter !== ALL) q.set("districtId", districtFilter);
    if (profileFilter !== ALL) q.set("profile", profileFilter);
    if (statusFilter !== ALL) q.set("status", statusFilter);
    if (consentFilter !== ALL) q.set("consent", consentFilter);
    const joined = joinedRange(joinedFilter);
    if (joined.from) q.set("joinedFrom", joined.from);
    if (joined.to) q.set("joinedTo", joined.to);
    let cancelled = false;
    apiJson<Page>(`/api/admin/users?${q.toString()}`)
      .then((res) => !cancelled && (setData(res), setError(null)))
      .catch((err: ApiError) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [role, page, query, classFilter, districtFilter, profileFilter, statusFilter, consentFilter, joinedFilter]);
  const filtered = Boolean(query) || classFilter !== ALL || districtFilter !== ALL || profileFilter !== ALL || statusFilter !== ALL || consentFilter !== ALL || joinedFilter !== ALL;

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Students and admins. Open someone to see their profile, coins and quizzes, adjust coins, or change their role." />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={role} onValueChange={(v) => update({ role: v === "all" ? null : v, page: null })}>
          <TabsList>
            <TabsTrigger value="all" className="h-9 px-3">All</TabsTrigger>
            <TabsTrigger value="STUDENT" className="h-9 px-3">Students</TabsTrigger>
            <TabsTrigger value="ADMIN" className="h-9 px-3">Admins</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:w-72">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or phone"
            aria-label="Search users"
            className="h-10 pl-9"
          />
        </div>
      </div>

      <div role="group" aria-label="Filters" className="grid gap-2 sm:flex sm:flex-wrap">
        <FilterSelect
          label="Class"
          value={classFilter}
          onChange={(v) => update({ class: v === ALL ? null : v, page: null })}
          options={[{ value: ALL, label: "All classes" }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <FilterSelect
          label="District"
          value={districtFilter}
          onChange={(v) => update({ district: v === ALL ? null : v, page: null })}
          options={[{ value: ALL, label: "All districts" }, ...districts.map((d) => ({ value: d.id, label: d.isActive ? d.name : `${d.name} (hidden)` }))]}
        />
        <FilterSelect
          label="Profile"
          value={profileFilter}
          onChange={(v) => update({ profile: v === ALL ? null : v, page: null })}
          options={[
            { value: ALL, label: "Any profile" },
            { value: "complete", label: "Profile complete" },
            { value: "incomplete", label: "Needs details" },
          ]}
        />
        <FilterSelect
          label="Parent's permission"
          value={consentFilter}
          onChange={(v) => update({ consent: v === ALL ? null : v, page: null })}
          options={[
            { value: ALL, label: "Any permission" },
            { value: "missing", label: "Under 18, still needed" },
            { value: "granted", label: "Parent agreed" },
          ]}
        />
        <FilterSelect
          label="Joined"
          value={joinedFilter}
          onChange={(v) => update({ joined: v === ALL ? null : v, page: null })}
          options={[
            { value: ALL, label: "Joined any time" },
            { value: "today", label: "Joined today" },
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "90", label: "Last 90 days" },
            { value: "this-year", label: "This year" },
            { value: "before-this-year", label: "Before this year" },
          ]}
        />
        <FilterSelect
          label="Account status"
          value={statusFilter}
          onChange={(v) => update({ status: v === ALL ? null : v, page: null })}
          options={[
            { value: ALL, label: "Any status" },
            { value: "ACTIVE", label: "Active" },
            { value: "SUSPENDED", label: "Suspended" },
            { value: "BLOCKED", label: "Blocked" },
            { value: "DELETED", label: "Erased" },
          ]}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!data && !error && <Skeleton className="h-96 rounded-2xl" />}

      {data && (
        <Card className={`${formCard} gap-0 py-0`}>
          {/* Desktop: table */}
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-3 py-3 font-medium">Class · district · age</th>
                <th className="px-3 py-3 text-right font-medium">Coins</th>
                <th className="px-3 py-3 text-right font-medium">Quizzes</th>
                <th className="px-4 py-3 text-right font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.users.map((u) => (
                <tr key={u.id} className="group cursor-pointer hover:bg-muted/40" onClick={() => router.push(`/users/${u.id}`)}>
                  <td className="px-4 py-3">
                    <Link href={`/users/${u.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <Avatar className="size-9 rounded-lg">
                        <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-brand-amber-text">{initials(u.name, u.email)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-medium group-hover:underline">
                          {u.name || "—"}
                          {u.role === "ADMIN" && <Badge className="h-5 px-1.5 text-[10px]">Admin</Badge>}
                          {!u.emailVerified && <UnverifiedBadge />}
                          {u.role === "STUDENT" && !u.profileComplete && <IncompleteBadge />}
                          {u.status !== "ACTIVE" && <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${STATUS_BADGE[u.status].className}`}>{STATUS_BADGE[u.status].label}</Badge>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                        {u.phone && <span className="block text-xs text-muted-foreground tabular-nums">{formatPhone(u.phone)}</span>}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {profileLine(u) || "—"}
                    {u.isMinor && (
                      <span className="block text-xs">
                        Under 18
                        {u.role === "STUDENT" && (
                          <span className={u.parentalConsent?.status === "GRANTED" ? "text-success" : "text-brand-amber-text"}>
                            {" · "}
                            {CONSENT_BADGE[u.parentalConsent?.status ?? "NONE"].label.toLowerCase()}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums">{u.coins.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{u.quizAttempts}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Phone: cards */}
          <ul className="divide-y md:hidden">
            {data.users.map((u) => (
              <li key={u.id}>
                <Link href={`/users/${u.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted/50">
                  <Avatar className="size-10 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-brand-amber-text">{initials(u.name, u.email)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="truncate">{u.name || u.email}</span>
                      {u.role === "ADMIN" && <Badge className="h-5 px-1.5 text-[10px]">Admin</Badge>}
                      {!u.emailVerified && <UnverifiedBadge />}
                      {u.role === "STUDENT" && !u.profileComplete && <IncompleteBadge />}
                      {u.status !== "ACTIVE" && <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${STATUS_BADGE[u.status].className}`}>{STATUS_BADGE[u.status].label}</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {u.email}
                      {u.phone && ` · ${formatPhone(u.phone)}`}
                    </span>
                    {profileLine(u) && <span className="block truncate text-xs text-muted-foreground">{profileLine(u)}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-medium tabular-nums">
                    <CoinsIcon className="size-4 text-warning" /> {u.coins}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {data.users.length === 0 && (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">{filtered ? "No users match these filters." : "No users yet."}</p>
          )}

          <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground tabular-nums">
              {data.total.toLocaleString("en-IN")} user{data.total === 1 ? "" : "s"}
            </span>
            {data.totalPages > 1 && (
              <span className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="size-9" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page">
                  <ChevronLeftIcon />
                </Button>
                <span className="tabular-nums">
                  {page} / {data.totalPages}
                </span>
                <Button variant="outline" size="icon" className="size-9" disabled={page >= data.totalPages} onClick={() => update({ page: String(page + 1) })} aria-label="Next page">
                  <ChevronRightIcon />
                </Button>
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <UsersList />
    </Suspense>
  );
}
