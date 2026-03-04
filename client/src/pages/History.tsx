import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, CheckCircle, Clock, XCircle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    completed: { label: "Concluído", className: "bg-green-500/20 text-green-400 border-green-500/30" },
    running: { label: "Executando", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    failed: { label: "Falhou", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  };
  const s = map[status] ?? { label: status, className: "" };
  return <Badge className={`text-xs border ${s.className}`}>{s.label}</Badge>;
}

export default function History() {
  const { data: runs } = trpc.monitoring.history.useQuery({ limit: 30 });
  const { data: trend } = trpc.monitoring.trend.useQuery({ days: 30 });

  const trendData = (trend ?? []).map((t) => ({
    date: formatDate(t.date),
    violations: t.count,
  }));

  const runData = (runs ?? [])
    .slice(0, 15)
    .reverse()
    .map((r) => ({
      date: formatDate(r.startedAt),
      found: r.totalFound ?? 0,
      violations: r.totalViolations ?? 0,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-blue-400" />
          Histórico de Monitoramentos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{runs?.length ?? 0} execuções registradas</p>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Violações nos Últimos 30 Dias</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.015 250)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.6 0.02 250)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0.02 250)" }} />
                  <Tooltip contentStyle={{ background: "oklch(0.17 0.015 250)", border: "1px solid oklch(0.25 0.015 250)", borderRadius: "8px", color: "oklch(0.95 0.01 250)" }} />
                  <Area type="monotone" dataKey="violations" stroke="#f97316" fill="url(#vGrad)" strokeWidth={2} name="Violações" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Sem dados ainda</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Anúncios Encontrados por Execução</CardTitle>
          </CardHeader>
          <CardContent>
            {runData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={runData}>
                  <defs>
                    <linearGradient id="fGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.015 250)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.6 0.02 250)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0.02 250)" }} />
                  <Tooltip contentStyle={{ background: "oklch(0.17 0.015 250)", border: "1px solid oklch(0.25 0.015 250)", borderRadius: "8px", color: "oklch(0.95 0.01 250)" }} />
                  <Area type="monotone" dataKey="found" stroke="#3b82f6" fill="url(#fGrad)" strokeWidth={2} name="Encontrados" />
                  <Area type="monotone" dataKey="violations" stroke="#f97316" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Violações" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Sem dados ainda</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Run History Table */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Execuções Recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs && runs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Início</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Fim</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Tipo</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Produtos</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Encontrados</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Violações</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const duration = run.finishedAt
                      ? Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
                      : null;
                    return (
                      <tr key={run.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-xs text-foreground">{new Date(run.startedAt).toLocaleString("pt-BR")}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">
                            {run.finishedAt ? new Date(run.finishedAt).toLocaleString("pt-BR") : "—"}
                            {duration !== null && <span className="ml-1 text-muted-foreground/60">({duration}s)</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <RunStatusBadge status={run.status} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={`text-xs border ${run.triggeredBy === "manual" ? "bg-purple-500/20 text-purple-400 border-purple-500/30" : "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
                            {run.triggeredBy === "manual" ? "Manual" : "Agendado"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs text-muted-foreground">{run.totalFound ?? 0}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs text-blue-400">{run.totalFound ?? 0}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-semibold ${(run.totalViolations ?? 0) > 0 ? "text-orange-400" : "text-green-400"}`}>
                            {run.totalViolations ?? 0}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {run.errorMessage ? (
                            <span className="text-xs text-red-400 truncate max-w-[200px] block">{run.errorMessage}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-16 text-center text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium text-foreground">Nenhuma execução registrada</p>
              <p className="text-xs mt-1">Execute o monitoramento para ver o histórico</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
