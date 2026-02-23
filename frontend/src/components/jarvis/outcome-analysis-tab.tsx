"use client";

import { useMemo, useState } from "react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  entryValuation: number;
  checkSize: number;
  fundSize: number;
}

const EXIT_MULTIPLES = [0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 75, 100, 200, 500, 1000];

function fmt$(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

export function OutcomeAnalysisTab({ entryValuation, checkSize, fundSize }: Props) {
  const initialOwnershipPct = entryValuation > 0 ? (checkSize / entryValuation) * 100 : 0;

  const [futureRounds, setFutureRounds] = useState(2);
  const [dilutionPerRound, setDilutionPerRound] = useState(20);

  const effectiveOwnershipPct = useMemo(() => {
    return initialOwnershipPct * Math.pow(1 - dilutionPerRound / 100, futureRounds);
  }, [initialOwnershipPct, dilutionPerRound, futureRounds]);

  const rows = useMemo(() => {
    const ownershipFrac = effectiveOwnershipPct / 100;
    return EXIT_MULTIPLES.map((mult) => {
      const exitVal = entryValuation * mult;
      const ourReturn = exitVal * ownershipFrac;
      const moic = checkSize > 0 ? ourReturn / checkSize : 0;
      const dpi = fundSize > 0 ? ourReturn / fundSize : 0;
      return {
        multiple: mult,
        exitValuation: exitVal,
        ownershipPct: effectiveOwnershipPct,
        ourReturn,
        moic,
        dpi,
      };
    });
  }, [entryValuation, checkSize, fundSize, effectiveOwnershipPct]);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        name: `${r.multiple}x`,
        Return: Math.round(r.ourReturn),
        MOIC: Math.round(r.moic * 100) / 100,
      })),
    [rows]
  );

  return (
    <div className="space-y-6">
      {/* Inputs card */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="font-display text-base font-semibold">
          Outcome Analysis
        </h3>
        <p className="text-muted-foreground text-sm">
          See what your investment could be worth at different exit valuations, accounting for dilution.
        </p>

        {/* Summary row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <Label className="text-xs">Entry Valuation</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium">
              {fmt$(entryValuation)}
            </div>
          </div>
          <div>
            <Label className="text-xs">Check Size</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium">
              {fmt$(checkSize)}
            </div>
          </div>
          <div>
            <Label className="text-xs">Initial Ownership</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium">
              {fmtPct(initialOwnershipPct)}
            </div>
          </div>
          <div>
            <Label className="text-xs">Fund Size</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium">
              {fmt$(fundSize)}
            </div>
          </div>
        </div>

        {/* Dilution assumptions */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Future Rounds</Label>
            <Input
              type="number"
              min={0}
              max={10}
              value={futureRounds}
              onChange={(e) => setFutureRounds(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div>
            <Label className="text-xs">Dilution per Round (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={5}
              value={dilutionPerRound}
              onChange={(e) => setDilutionPerRound(Math.max(0, Math.min(100, Number(e.target.value))))}
            />
          </div>
          <div>
            <Label className="text-xs">Ownership at Exit</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium">
              {fmtPct(effectiveOwnershipPct)}
            </div>
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          Diluted from {fmtPct(initialOwnershipPct)} to{" "}
          <span className="font-semibold text-foreground">{fmtPct(effectiveOwnershipPct)}</span>
          {` over ${futureRounds} round${futureRounds !== 1 ? "s" : ""} at ${dilutionPerRound}% each`}.
        </p>
      </div>

      {/* Chart */}
      <div className="rounded-xl border bg-card p-5">
        <h4 className="font-display mb-4 text-sm font-semibold">
          Return by Exit Multiple
        </h4>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => fmt$(v)}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
              formatter={(value, name) => {
                const v = Number(value);
                return name === "Return" ? [fmt$(v), "Our Return"] : [`${v}x`, "MOIC"];
              }}
            />
            <Line
              type="monotone"
              dataKey="Return"
              stroke="hsl(142 71% 45%)"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card p-5">
        <h4 className="font-display mb-4 text-sm font-semibold">
          Outcome by Exit Multiple
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="pb-2 pr-4">Exit Multiple</th>
                <th className="pb-2 pr-4">Exit Valuation</th>
                <th className="pb-2 pr-4">Ownership at Exit</th>
                <th className="pb-2 pr-4">Our Return</th>
                <th className="pb-2 pr-4">MOIC</th>
                <th className="pb-2">DPI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isBreakeven = r.moic >= 1;
                return (
                  <tr
                    key={r.multiple}
                    className={`border-b last:border-0 ${r.moic < 1 ? "text-muted-foreground" : ""}`}
                  >
                    <td className="py-3 pr-4 font-medium">{r.multiple}x</td>
                    <td className="py-3 pr-4">{fmt$(r.exitValuation)}</td>
                    <td className="py-3 pr-4">{fmtPct(r.ownershipPct)}</td>
                    <td className={`py-3 pr-4 font-medium ${isBreakeven ? "text-green-600 dark:text-green-400" : ""}`}>
                      {fmt$(r.ourReturn)}
                    </td>
                    <td className={`py-3 pr-4 ${isBreakeven ? "text-green-600 dark:text-green-400" : ""}`}>
                      {r.moic.toFixed(2)}x
                    </td>
                    <td className={`py-3 ${r.dpi >= 1 ? "font-medium text-green-600 dark:text-green-400" : ""}`}>
                      {r.dpi.toFixed(2)}x
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
