import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { SectionCard, GoalBar, useMoney } from "@/components/dashboard/primitives";
import { GoalCard } from "@/components/dashboard/goal-card";
import { usePeriodData } from "@/components/dashboard/use-period-data";
import type { RangePreset } from "@/components/dashboard/date-range";
import { useFinance } from "@/lib/finance/store";
import { formatPercent, founderRateLabel } from "@/lib/finance/currency";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/goals")({
  head: () => ({ meta: [{ title: "Financial Goals · ALKWITI" }] }),
  component: GoalsPage,
});

function GoalsPage() {
  const [preset, setPreset] = useState<RangePreset>("all");
  const data = usePeriodData(preset);
  const { config } = useFinance();
  const money = useMoney();

  const chinaDone = data.china.status === "complete";
  const salaryRate = config.founders.reduce((s, f) => s + f.salaryRate, 0);
  const totalBefore =
    salaryRate +
    config.china.allocationRate +
    config.operational.rateBeforeChina +
    config.dubai.rateBeforeChina;
  const totalAfter = salaryRate + config.operational.rateAfterChina + config.dubai.rateAfterChina;
  const allocationsBalanced =
    Math.abs(totalBefore - 1) <= 0.0005 && Math.abs(totalAfter - 1) <= 0.0005;

  return (
    <DashboardShell title="Financial Goals" rangePreset={preset} onRangeChange={setPreset}>
      {/* China -> Dubai allocation stage banner */}
      <div className="rounded-2xl border border-brand/25 bg-brand/[0.05] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
            <Info className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              Dubai allocation stage: {formatPercent(data.dubai.currentRate)} of revenue
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{data.dubai.rateReason}.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
                  !chinaDone
                    ? "border-brand/40 bg-brand/10 text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                Stage 1 · China incomplete → Dubai {formatPercent(config.dubai.rateBeforeChina)}
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground" />
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
                  chinaDone
                    ? "border-success/40 bg-success/10 text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                Stage 2 · China complete → Dubai {formatPercent(config.dubai.rateAfterChina)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary goals */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <GoalCard goal={data.china} />
        <GoalCard goal={data.dubai} />
      </div>

      {/* Salary allocations */}
      <SectionCard
        title="Founder salary allocations"
        description={`${founderRateLabel(config.founders.map((f) => f.salaryRate))} — paid reflects Notion Founder Salary rows`}
        className="mt-4"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {data.salaries.map((s) => (
            <div key={s.founderId} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{s.name}</span>
                <span className="text-xs text-muted-foreground">{formatPercent(s.rate)}</span>
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">
                {money(s.allocated)}
              </p>
              <p className="text-xs text-muted-foreground">allocated</p>
              <div className="mt-3">
                <GoalBar value={s.allocated > 0 ? s.paid / s.allocated : 0} tone="success" />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Paid {money(s.paid)}</span>
                {s.outstanding < 0 ? (
                  <span className="font-medium text-destructive">
                    Overpaid by {money(-s.outstanding)}
                  </span>
                ) : (
                  <span className="font-medium text-foreground">{money(s.outstanding)} unpaid</span>
                )}
              </div>
            </div>
          ))}
        </div>
        {data.unattributedSalary > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {money(data.unattributedSalary)} of founder salary not matched to a founder — check the
            Vendor in Notion
          </p>
        )}
      </SectionCard>

      {/* Operational budget */}
      <SectionCard
        title="Operational budget"
        description={`${formatPercent(data.operational.allocationRate)} allocation vs operational spend`}
        className="mt-4"
      >
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Allocation" value={money(data.operational.budget)} />
          <Stat label="Actual spend" value={money(data.operational.spent)} />
          <Stat
            label="Remaining"
            value={
              data.operational.remaining < 0
                ? `Over by ${money(-data.operational.remaining)}`
                : money(data.operational.remaining)
            }
          />
          <Stat label="Utilization" value={`${Math.round(data.operational.utilization * 100)}%`} />
        </div>
        <div className="mt-4">
          <GoalBar
            value={data.operational.utilization}
            tone={data.operational.utilization > 1 ? "destructive" : "brand"}
          />
        </div>
        <p className="mt-3 rounded-lg border border-border bg-background px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">
            Allocation {formatPercent(data.operational.allocationRate)}
          </span>
          {" — "}
          {data.operational.rateReason}. Steps up to{" "}
          {formatPercent(config.operational.rateAfterChina)} on revenue earned after China
          completes.
        </p>
      </SectionCard>

      {/* Allocation model reference */}
      <SectionCard
        title="Revenue allocation model"
        description="How every rupee of ALKWITI revenue is planned"
        className="mt-4"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {config.founders.map((f) => (
            <AllocationTile
              key={f.id}
              label={f.name}
              pct={formatPercent(f.salaryRate)}
              note="Salary"
            />
          ))}
          <AllocationTile
            label="China visit"
            pct={formatPercent(data.china.currentRate)}
            note={chinaDone ? "Complete" : "Goal"}
            accent
          />
          <AllocationTile
            label="Operational"
            pct={formatPercent(data.operational.allocationRate)}
            note={chinaDone ? "After China" : "Before China"}
          />
          <AllocationTile
            label="Dubai"
            pct={formatPercent(data.dubai.currentRate)}
            note={chinaDone ? "After China" : "Before China"}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Founder salaries ({formatPercent(salaryRate)}) are fixed. China gets{" "}
          {formatPercent(config.china.allocationRate)} until its target is reached, then 0%.
          Operational and Dubai step up from {formatPercent(config.operational.rateBeforeChina)} /{" "}
          {formatPercent(config.dubai.rateBeforeChina)} to{" "}
          {formatPercent(config.operational.rateAfterChina)} /{" "}
          {formatPercent(config.dubai.rateAfterChina)} on revenue earned after China completes.
          Total: {formatPercent(totalBefore)} before China · {formatPercent(totalAfter)} after.
          {!allocationsBalanced && (
            <span className="text-destructive">
              {" "}
              Allocations should total 100% — adjust them in Settings.
            </span>
          )}
        </p>
      </SectionCard>
    </DashboardShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function AllocationTile({
  label,
  pct,
  note,
  accent,
}: {
  label: string;
  pct: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        accent ? "border-brand/30 bg-brand/[0.05]" : "border-border bg-background",
      )}
    >
      <p className={cn("text-xl font-semibold", accent ? "text-brand" : "text-foreground")}>
        {pct}
      </p>
      <p className="mt-1 truncate text-xs font-medium text-foreground" title={label}>
        {label}
      </p>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
