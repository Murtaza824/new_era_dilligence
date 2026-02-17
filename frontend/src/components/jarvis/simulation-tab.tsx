"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Sparkles,
  Play,
  Loader2,
  TrendingUp,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { simulations as simApi } from "@/lib/api";
import type { SimulationRun, SimulationSuggestion } from "@/types";

interface Props {
  companyId: string;
  companyName: string;
}

function fmt$(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function SimulationTab({ companyId, companyName }: Props) {
  // Form state — core inputs
  const [entryVal, setEntryVal] = useState(20_000_000);
  const [checkSize, setCheckSize] = useState(175_000);
  const [fundSize, setFundSize] = useState(5_000_000);

  // Derived ownership
  const ownershipPct = entryVal > 0 ? (checkSize / entryVal) * 100 : 0;

  // Advanced params (filled by AI Suggest or manually)
  const [exitMultMean, setExitMultMean] = useState(8);
  const [exitMultStd, setExitMultStd] = useState(6);
  const [yearsToExit, setYearsToExit] = useState(7);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // State
  const [result, setResult] = useState<SimulationRun | null>(null);
  const [history, setHistory] = useState<SimulationRun[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [running, setRunning] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<SimulationSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    simApi.list(companyId).then(setHistory).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleSuggest = async () => {
    setSuggesting(true);
    setError(null);
    try {
      const s = await simApi.suggest(companyId);
      setSuggestion(s);
      setEntryVal(s.entry_valuation);
      setCheckSize(s.check_size);
      setExitMultMean(s.exit_multiple_mean);
      setExitMultStd(s.exit_multiple_std);
      setYearsToExit(s.years_to_exit);
      setShowAdvanced(true);
      toast.success("AI suggestions applied");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to get suggestions";
      setError(msg);
      toast.error(msg);
    } finally {
      setSuggesting(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await simApi.run(companyId, {
        entry_valuation: entryVal,
        ownership_pct: ownershipPct,
        check_size: checkSize,
        fund_size: fundSize,
        exit_multiple_mean: exitMultMean,
        exit_multiple_std: exitMultStd,
        years_to_exit: yearsToExit,
      });
      setResult(res);
      loadHistory();
      toast.success("Simulation complete");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Simulation failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  const loadHistoricRun = (run: SimulationRun) => {
    setResult(run);
    setEntryVal(run.inputs.entry_valuation);
    setCheckSize(run.inputs.check_size);
    setFundSize(run.inputs.fund_size);
    setExitMultMean(run.inputs.exit_multiple_mean);
    setExitMultStd(run.inputs.exit_multiple_std);
    setYearsToExit(run.inputs.years_to_exit);
    setShowHistory(false);
  };

  const mc = result?.outputs?.monte_carlo;
  const scenarios = result?.outputs?.scenarios;

  return (
    <div>
      {/* Input form */}
      <div className="mb-6 rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">
            Simulation Parameters
          </h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSuggest}
              disabled={suggesting}
            >
              {suggesting ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-4" />
              )}
              AI Suggest
            </Button>
            {history.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History className="mr-1.5 size-4" />
                History ({history.length})
              </Button>
            )}
          </div>
        </div>

        {/* AI rationale */}
        {suggestion?.rationale && (
          <div className="mb-4 rounded-lg bg-muted px-4 py-3 text-sm">
            <span className="font-medium">AI rationale: </span>
            {suggestion.rationale}
          </div>
        )}

        {/* History dropdown */}
        {showHistory && (
          <div className="mb-4 space-y-1 rounded-lg border bg-muted/50 p-3">
            {history.map((run) => (
              <button
                key={run.id}
                onClick={() => loadHistoricRun(run)}
                className="hover:bg-accent flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors"
              >
                <span>
                  {fmt$(run.inputs.entry_valuation)} @ {fmtPct(run.inputs.ownership_pct)}
                </span>
                <span className="text-muted-foreground text-xs">
                  Impact: {fmtPct(run.outputs.impact_score)} ·{" "}
                  {new Date(run.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Core inputs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <Label className="text-xs">Entry Valuation ($)</Label>
            <Input
              type="number"
              value={entryVal}
              onChange={(e) => setEntryVal(Number(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs">Check Size ($)</Label>
            <Input
              type="number"
              value={checkSize}
              onChange={(e) => setCheckSize(Number(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs">Ownership (auto)</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium">
              {ownershipPct.toFixed(2)}%
            </div>
          </div>
          <div>
            <Label className="text-xs">Fund Size ($)</Label>
            <Input
              type="number"
              value={fundSize}
              onChange={(e) => setFundSize(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-muted-foreground hover:text-foreground mt-3 flex items-center gap-1 text-xs transition-colors"
        >
          {showAdvanced ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
          Advanced parameters
        </button>

        {showAdvanced && (
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Exit Multiple (Mean)</Label>
              <Input
                type="number"
                step="0.5"
                value={exitMultMean}
                onChange={(e) => setExitMultMean(Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Exit Multiple (Std Dev)</Label>
              <Input
                type="number"
                step="0.5"
                value={exitMultStd}
                onChange={(e) => setExitMultStd(Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Years to Exit</Label>
              <Input
                type="number"
                value={yearsToExit}
                onChange={(e) => setYearsToExit(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {/* Run button */}
        <div className="mt-4">
          <Button onClick={handleRun} disabled={running}>
            {running ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Play className="mr-1.5 size-4" />
            )}
            Run Simulation
          </Button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Results */}
      {mc && (
        <div className="space-y-6">
          {/* Impact score hero */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-xl border bg-card p-5 text-center">
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
                Fund Impact
              </p>
              <p className="font-display text-3xl font-bold text-green-600">
                {fmtPct(result!.outputs.impact_score)}
              </p>
              <p className="text-muted-foreground text-xs">of fund returned</p>
            </div>
            <div className="rounded-xl border bg-card p-5 text-center">
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
                Mean MOIC
              </p>
              <p className="font-display text-3xl font-bold">
                {mc.mean_moic.toFixed(1)}x
              </p>
              <p className="text-muted-foreground text-xs">
                Median: {mc.median_moic.toFixed(1)}x
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5 text-center">
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
                Mean Return
              </p>
              <p className="font-display text-3xl font-bold">
                {fmt$(mc.mean_return)}
              </p>
              <p className="text-muted-foreground text-xs">
                on {fmt$(checkSize)} check
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5 text-center">
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
                P(Loss)
              </p>
              <p className="font-display text-3xl font-bold">
                {fmtPct(mc.prob_loss * 100)}
              </p>
              <p className="text-muted-foreground text-xs">
                P(5x+): {fmtPct(mc.prob_5x * 100)}
              </p>
            </div>
          </div>

          {/* MOIC Distribution chart */}
          <div className="rounded-xl border bg-card p-5">
            <h4 className="font-display mb-4 text-sm font-semibold">
              Return Multiple Distribution (MOIC)
            </h4>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={mc.histogram}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="hsl(142 71% 45%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="text-muted-foreground mt-2 flex justify-center gap-6 text-xs">
              <span>P(2x+): {fmtPct(mc.prob_2x * 100)}</span>
              <span>P(5x+): {fmtPct(mc.prob_5x * 100)}</span>
              <span>P(10x+): {fmtPct(mc.prob_10x * 100)}</span>
            </div>
          </div>

          {/* Scenario table */}
          {scenarios && scenarios.length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <h4 className="font-display mb-4 text-sm font-semibold">
                Scenario Analysis
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs">
                      <th className="pb-2 pr-4">Scenario</th>
                      <th className="pb-2 pr-4">Probability</th>
                      <th className="pb-2 pr-4">Exit Multiple</th>
                      <th className="pb-2 pr-4">Exit Valuation</th>
                      <th className="pb-2 pr-4">Return</th>
                      <th className="pb-2 pr-4">MOIC</th>
                      <th className="pb-2">Fund Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((s, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium">{s.name}</td>
                        <td className="py-3 pr-4">{fmtPct(s.probability * 100)}</td>
                        <td className="py-3 pr-4">{s.exit_multiple.toFixed(1)}x</td>
                        <td className="py-3 pr-4">{fmt$(s.exit_valuation)}</td>
                        <td className="py-3 pr-4">{fmt$(s.return)}</td>
                        <td className="py-3 pr-4">{s.moic.toFixed(1)}x</td>
                        <td className="py-3">{fmtPct(s.fund_return_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Percentile table */}
          {mc.percentiles && (
            <div className="rounded-xl border bg-card p-5">
              <h4 className="font-display mb-4 text-sm font-semibold">
                Return Percentiles
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs">
                      <th className="pb-2 pr-4">Percentile</th>
                      <th className="pb-2 pr-4">Exit Valuation</th>
                      <th className="pb-2 pr-4">Return</th>
                      <th className="pb-2 pr-4">MOIC</th>
                      <th className="pb-2">Fund Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(mc.percentiles).map(([key, val]) => (
                      <tr key={key} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">
                          {key.replace("p", "")}th
                        </td>
                        <td className="py-2 pr-4">{fmt$(val.exit_valuation)}</td>
                        <td className="py-2 pr-4">{fmt$(val.return)}</td>
                        <td className="py-2 pr-4">{val.moic.toFixed(1)}x</td>
                        <td className="py-2">{fmtPct(val.fund_return_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!mc && !running && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16">
          <TrendingUp className="text-muted-foreground mb-3 size-10" />
          <p className="text-lg font-medium">No simulation yet</p>
          <p className="text-muted-foreground text-sm">
            Configure parameters above and click "Run Simulation" — or use "AI
            Suggest" to auto-fill.
          </p>
        </div>
      )}
    </div>
  );
}
