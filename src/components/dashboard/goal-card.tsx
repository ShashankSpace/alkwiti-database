import type { GoalProgress } from "@/lib/finance/types";
import { GoalBar, useMoney } from "./primitives";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/finance/currency";
import { Plane, Building2, CheckCircle2 } from "lucide-react";

const ICONS = { china: Plane, dubai: Building2 } as const;

export function GoalCard({ goal }: { goal: GoalProgress }) {
  const money = useMoney();
  const Icon = ICONS[goal.key];
  const pct = Math.round(goal.completion * 100);
  const done = goal.status === "complete";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-brand/12 text-brand">
            <Icon className="size-[18px]" strokeWidth={1.75} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{goal.label}</h3>
            <p className="text-xs text-muted-foreground">
              Target {money(goal.target, { compact: true })} · {formatPercent(goal.currentRate)} of
              revenue
            </p>
          </div>
        </div>
        {done && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-xs font-medium text-success">
            <CheckCircle2 className="size-3.5" /> Complete
          </span>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between">
        <p className="text-xl font-semibold tabular-nums text-foreground">
          {money(goal.accumulated)}
        </p>
        <p className="text-sm font-medium tabular-nums text-muted-foreground">{pct}%</p>
      </div>
      <div className="mt-2">
        <GoalBar value={goal.completion} tone={done ? "success" : "brand"} />
      </div>
      <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>of {money(goal.target)}</span>
        <span>{money(goal.remaining)} remaining</span>
      </div>

      {goal.contributed > 0 && (
        <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-background px-2.5 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Spent (from Notion)</span>
            <span className="font-medium tabular-nums text-foreground">
              {money(goal.contributed)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Unspent allocation</span>
            {goal.unspent < 0 ? (
              <span className="font-medium tabular-nums text-destructive">
                Over by {money(-goal.unspent)}
              </span>
            ) : (
              <span className="font-medium tabular-nums text-foreground">
                {money(goal.unspent)}
              </span>
            )}
          </div>
        </div>
      )}

      {goal.rateReason && (
        <p
          className={cn(
            "mt-3 rounded-lg border px-2.5 py-2 text-xs leading-relaxed",
            done
              ? "border-success/20 bg-success/[0.06] text-foreground"
              : "border-border bg-background text-muted-foreground",
          )}
        >
          <span className="font-medium text-foreground">
            Allocation {formatPercent(goal.currentRate)}
          </span>
          {" — "}
          {goal.rateReason}.
        </p>
      )}
    </div>
  );
}
