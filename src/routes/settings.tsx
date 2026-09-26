import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  RotateCcw,
  Database,
  Sun,
  Moon,
  Monitor,
  Loader2,
  Check,
  AlertCircle,
  CloudOff,
  Cloud,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { SectionCard } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import type { RangePreset } from "@/components/dashboard/date-range";
import { useFinance } from "@/lib/finance/store";
import { DEFAULT_CONFIG, configsEqual } from "@/lib/finance/config";
import { exchangeRateLabel } from "@/lib/finance/currency";
import type { CurrencyCode, FinanceConfig } from "@/lib/finance/types";
import { useSettingsSync } from "@/lib/settings/sync";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · ALKWITI" }] }),
  component: SettingsPage,
});

const inputClass =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none ring-ring focus-visible:ring-2";

/** A labelled numeric input that edits a percentage (stored as a 0..1 fraction). */
function PercentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (fraction: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={Math.round(value * 1000) / 10}
          onChange={(e) => onChange((Number(e.target.value) || 0) / 100)}
          className={inputClass}
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
    </label>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">₹</span>
        <input
          type="number"
          min={0}
          step={1000}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={inputClass}
        />
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "mt-1.5")}
      />
    </label>
  );
}

/** Where saved settings end up — shown under the page intro. */
function StorageNote() {
  const { status, accountEmail, error, reload, lastSavedAt } = useSettingsSync();

  if (status === "error") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-foreground">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0">
          <p className="font-medium">Account sync problem</p>
          <p className="mt-0.5 leading-relaxed text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={reload}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const Icon = status === "ready" ? Cloud : CloudOff;
  const text =
    status === "loading"
      ? "Checking your account settings…"
      : status === "ready"
        ? `Saved settings sync to your Google account${accountEmail ? ` (${accountEmail})` : ""} and follow you across devices.`
        : status === "signed-out"
          ? "You're not signed in — saved settings stay in this browser only."
          : "Account sync isn't configured, so saved settings stay in this browser only.";

  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      {status === "loading" ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
      ) : (
        <Icon className="size-3.5 shrink-0" />
      )}
      <span>
        {text}
        {lastSavedAt && (
          <span className="ml-1">
            Last saved{" "}
            {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
          </span>
        )}
      </span>
    </p>
  );
}

function SettingsPage() {
  const [preset, setPreset] = useState<RangePreset>("all");
  const { config, source } = useFinance();
  const { mode, previewMode } = useTheme();
  const { save, saving } = useSettingsSync();

  // Everything on this page edits a draft. Nothing is persisted until Save.
  const [draft, setDraft] = useState<FinanceConfig>(config);
  const [draftTheme, setDraftTheme] = useState<ThemeMode>(mode);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const draftThemeRef = useRef(draftTheme);
  draftThemeRef.current = draftTheme;

  // The committed values the draft was seeded from, so we can tell an external
  // update (hydration, account sync) apart from the user's own edits.
  const seenConfigRef = useRef(config);
  const seenThemeRef = useRef(mode);

  const dirty = !configsEqual(draft, config) || draftTheme !== mode;

  // Adopt externally committed config (browser hydration, account sync) unless
  // the user has edits in flight — their typing always wins.
  useEffect(() => {
    if (seenConfigRef.current === config) return;
    const hasLocalEdits = !configsEqual(draftRef.current, seenConfigRef.current);
    seenConfigRef.current = config;
    if (!hasLocalEdits) setDraft(config);
  }, [config]);

  useEffect(() => {
    if (seenThemeRef.current === mode) return;
    const hasLocalEdits = draftThemeRef.current !== seenThemeRef.current;
    seenThemeRef.current = mode;
    if (!hasLocalEdits) setDraftTheme(mode);
  }, [mode]);

  // Preview the drafted appearance live, without persisting it.
  useEffect(() => {
    previewMode(draftTheme === mode ? null : draftTheme);
  }, [draftTheme, mode, previewMode]);

  // Leaving the page drops an unsaved appearance preview.
  useEffect(() => () => previewMode(null), [previewMode]);

  // Warn before a reload/close throws away unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /** Patch the draft config. Purely local — no persistence. */
  const edit = useCallback((patch: (prev: FinanceConfig) => FinanceConfig) => {
    setDraft((prev) => patch(prev));
  }, []);

  const handleSave = useCallback(async () => {
    // Stamp the rate timestamp only when the rate itself actually changed.
    const rateChanged = draft.currency.usdInrRate !== config.currency.usdInrRate;
    const next: FinanceConfig = rateChanged
      ? { ...draft, currency: { ...draft.currency, rateUpdatedAt: new Date().toISOString() } }
      : draft;

    const result = await save({ config: next, theme: draftTheme });

    setDraft(next);
    seenConfigRef.current = next;
    seenThemeRef.current = draftTheme;

    if (result.syncedToAccount) {
      toast.success("Settings saved", { description: "Synced to your Google account." });
    } else if (result.error) {
      toast.error("Saved to this browser only", { description: result.error });
    } else {
      toast.success("Settings saved", {
        description: "Stored in this browser. Sign in with Google to sync across devices.",
      });
    }
  }, [draft, draftTheme, config.currency.usdInrRate, save]);

  const handleDiscard = useCallback(() => {
    setDraft(config);
    setDraftTheme(mode);
  }, [config, mode]);

  const handleResetDefaults = useCallback(() => {
    setDraft(DEFAULT_CONFIG);
    toast("Defaults restored", { description: "Press Save to apply them." });
  }, []);

  return (
    <DashboardShell title="Settings" rangePreset={preset} onRangeChange={setPreset}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm text-muted-foreground">
            These values drive every calculation. Nothing is hard-coded in the interface. Edits stay
            on this page until you press Save.
          </p>
          <StorageNote />
        </div>
        <Button variant="outline" size="sm" onClick={handleResetDefaults}>
          <RotateCcw className="size-3.5" /> Reset defaults
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Founders */}
        <SectionCard title="Founders" description="Names and salary allocation rates">
          <div className="space-y-5">
            {draft.founders.map((f, idx) => (
              <div key={f.id} className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label={`Founder ${idx + 1} name`}
                  value={f.name}
                  onChange={(name) =>
                    edit((prev) => {
                      const founders = [...prev.founders] as typeof prev.founders;
                      founders[idx] = { ...founders[idx]!, name };
                      return { ...prev, founders };
                    })
                  }
                />
                <PercentField
                  label="Salary allocation"
                  value={f.salaryRate}
                  onChange={(salaryRate) =>
                    edit((prev) => {
                      const founders = [...prev.founders] as typeof prev.founders;
                      founders[idx] = { ...founders[idx]!, salaryRate };
                      return { ...prev, founders };
                    })
                  }
                />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* China */}
        <SectionCard title="China industrial visit" description="Target and allocation">
          <div className="grid gap-3 sm:grid-cols-2">
            <MoneyField
              label="Target"
              value={draft.china.target}
              onChange={(target) => edit((p) => ({ ...p, china: { ...p.china, target } }))}
            />
            <PercentField
              label="Allocation"
              value={draft.china.allocationRate}
              onChange={(allocationRate) =>
                edit((p) => ({ ...p, china: { ...p.china, allocationRate } }))
              }
            />
          </div>
        </SectionCard>

        {/* Operational */}
        <SectionCard
          title="Operational expenses"
          description="Dynamic allocation, gated on China goal"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <PercentField
              label="Before China"
              value={draft.operational.rateBeforeChina}
              onChange={(rateBeforeChina) =>
                edit((p) => ({
                  ...p,
                  operational: { ...p.operational, rateBeforeChina },
                }))
              }
            />
            <PercentField
              label="After China"
              value={draft.operational.rateAfterChina}
              onChange={(rateAfterChina) =>
                edit((p) => ({
                  ...p,
                  operational: { ...p.operational, rateAfterChina },
                }))
              }
            />
          </div>
        </SectionCard>

        {/* Dubai */}
        <SectionCard title="Dubai incorporation" description="Target and dynamic allocation">
          <div className="grid gap-3 sm:grid-cols-3">
            <MoneyField
              label="Target"
              value={draft.dubai.target}
              onChange={(target) => edit((p) => ({ ...p, dubai: { ...p.dubai, target } }))}
            />
            <PercentField
              label="Before China"
              value={draft.dubai.rateBeforeChina}
              onChange={(rateBeforeChina) =>
                edit((p) => ({ ...p, dubai: { ...p.dubai, rateBeforeChina } }))
              }
            />
            <PercentField
              label="After China"
              value={draft.dubai.rateAfterChina}
              onChange={(rateAfterChina) =>
                edit((p) => ({ ...p, dubai: { ...p.dubai, rateAfterChina } }))
              }
            />
          </div>
        </SectionCard>

        {/* Currency */}
        <SectionCard title="Currency" description="Display currency and exchange rate">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Default display currency</span>
              <select
                value={draft.currency.default}
                onChange={(e) => {
                  const c = e.target.value as CurrencyCode;
                  edit((p) => ({ ...p, currency: { ...p.currency, default: c } }));
                }}
                className={cn(inputClass, "mt-1.5")}
              >
                <option value="INR">₹ INR</option>
                <option value="USD">$ USD</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">USD/INR rate</span>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">₹</span>
                <input
                  type="number"
                  min={1}
                  step={0.01}
                  value={draft.currency.usdInrRate}
                  onChange={(e) =>
                    edit((p) => ({
                      ...p,
                      currency: {
                        ...p.currency,
                        usdInrRate: Number(e.target.value) || p.currency.usdInrRate,
                      },
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </label>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{exchangeRateLabel(config)}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            INR is the source-of-truth currency. USD is a display conversion only — underlying
            values and history are never modified. The switch in the header changes the current view
            without touching this default.
          </p>
        </SectionCard>

        {/* Appearance */}
        <SectionCard title="Appearance" description="Light, dark, or match your system">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "system", label: "System", icon: Monitor },
              ] as { value: ThemeMode; label: string; icon: typeof Sun }[]
            ).map((opt) => {
              const Icon = opt.icon;
              const active = draftTheme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDraftTheme(opt.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-colors",
                    active
                      ? "border-brand/40 bg-brand/[0.06] text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-5", active && "text-brand")} strokeWidth={1.75} />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            You're seeing a live preview — it's only kept once you Save. The quick toggle in the
            header switches between light and dark immediately.
          </p>
        </SectionCard>

        {/* Data source */}
        <SectionCard title="Data source" description="Where financial records come from">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Database className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                {source.name}
                {source.isSample && (
                  <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                    Sample
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                The dashboard reads invoices and expenses through a pluggable data-source layer. A
                live source (Google Sheets, Excel, an API, or an MCP connection) can be added later
                without changing the interface. No data is entered or invoiced inside the dashboard.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Save bar — the only way settings get persisted. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-border bg-background/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm" aria-live="polite">
            {dirty ? (
              <>
                <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                <span className="font-medium text-foreground">Unsaved changes</span>
              </>
            ) : (
              <>
                <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                <span className="text-muted-foreground">All changes saved</span>
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDiscard} disabled={!dirty || saving}>
              Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
