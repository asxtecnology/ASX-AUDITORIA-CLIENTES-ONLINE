// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, BarChart3, CheckCircle, Clock, Package, Play,
  RefreshCw, ShieldAlert, TrendingDown, TrendingUp, Users, WifiOff,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie,
} from "recharts";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: "Aberta", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    notified: { label: "Notificado", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    resolved: { label: "Resolvida", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  };
  const s = map[status] ?? { label: status, className: "" };
  return <Badge className={`text-xs border ${s.className}`}>{s.label}</Badge>;
}

function KpiSkeleton() {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-7 rounded-lg" />
        </div>
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-red-500/30 bg-red-500/5">
      <CardContent className="p-6 text-center">
        <WifiOff className="h-10 w-10 mx-auto mb-3 text-red-400/60" />
        <p className="text-sm font-medium text-foreground">Erro ao carregar dados</p>
        <p className="text-xs text-muted-foreground mt-1">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-3 gap-2">
          <RefreshCw className="h-3 w-3" /> Tentar novamente
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [isRunning, setIsRunning] = useState(false);

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErr,
    refetch: refetchStats,
  } = trpc.monitoring.stats.useQuery();
  const {
    data: trend,
    isLoading: trendLoading,
  } = trpc.monitoring.trend.useQuery({ days: 30 });
  const {
    data: trendSlot,
    isLoading: trendSlotLoading,
  } = trpc.monitoring.trendBySlot.useQuery({ days: 30 });
  const {
    data: latestRun,
    refetch: refetchRun,
  } = trpc.monitoring.latest.useQuery();
  const {
    data: violations,
    isLoading: violationsLoading,
    isError: violationsError,
    refetch: refetchViolations,
  } = trpc.violations.list.useQuery({ status: "open", limit: 8, offset: 0 });
  const { data: products } = trpc.products.list.useQuery({ limit: 1, offset: 0 });
  const { data: clientesList } = trpc.clientes.list.useQuery();

  const runNow = trpc.monitoring.runNow.useMutation({
    onSuccess: (data) => {
      setIsRunning(false);
      toast.success(`Monitoramento concluído! ${data.violations} violação(ões) detectada(s).`);
      refetchStats();
      refetchRun();
      refetchViolations();
    },
    onError: (err) => {
      setIsRunning(false);
      toast.error(err.message || "Erro ao executar monitoramento.");
    },
  });

  const handleRunNow = () => {
    setIsRunning(true);
    toast.info("Monitoramento iniciado. Isso pode levar alguns minutos...");
    runNow.mutate();
  };

  const trendData = (trend ?? []).map((t) => ({
    date: formatDateShort(t.date),
    violations: t.count,
  }));

  const activeClientes = (clientesList ?? []).filter((c: any) => c.status === "ativo");
  const clientesWithViolations = activeClientes.filter((c: any) => (c.totalViolacoes ?? 0) > 0);

  const kpis = [
    { title: "Violações Abertas", value: stats?.open ?? 0, icon: ShieldAlert, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
    { title: "Total de Violações", value: stats?.total ?? 0, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
    { title: "Detectadas Hoje", value: stats?.todayCount ?? 0, icon: TrendingDown, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
    { title: "Resolvidas", value: stats?.resolved ?? 0, icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
    { title: "Clientes Monitorados", value: activeClientes.length, icon: Users, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
    { title: "Produtos no Catálogo", value: products?.total ?? 0, icon: Package, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  ];

  const PIE_COLORS = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#eab308", "#06b6d4", "#ef4444", "#84cc16", "#6366f1"];
  const clientePieData = activeClientes
    .map((c: any, i: number) => ({
      name: c.nome?.length > 15 ? c.nome.slice(0, 15) + "..." : c.nome,
      value: c.totalViolacoes ?? 0,
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }))
    .filter((d: any) => d.value > 0)
    .sort((a: any, b: any) => b.value - a.value);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento de preços ASX no Mercado Livre
          </p>
        </div>
        <div className="flex items-center gap-3">
          {latestRun && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Último: {new Date(latestRun.startedAt).toLocaleString("pt-BR")}</span>
              <Badge
                className={`text-xs border ${
                  latestRun.status === "completed"
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : latestRun.status === "running"
                    ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                    : "bg-red-500/20 text-red-400 border-red-500/30"
                }`}
              >
                {latestRun.status === "completed" ? "Concluído" : latestRun.status === "running" ? "Executando" : "Falhou"}
              </Badge>
            </div>
          )}
          <Button onClick={handleRunNow} disabled={isRunning} className="gap-2 bg-primary hover:bg-primary/90">
            {isRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isRunning ? "Executando..." : "Executar Agora"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {statsError ? (
        <ErrorCard
          message={statsErr?.message ?? "Não foi possível conectar ao servidor"}
          onRetry={() => refetchStats()}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {statsLoading
            ? Array.from({ length: 5 }).map((_, i) => <KpiSkeleton key={i} />)
            : kpis.map((kpi) => (
                <Card key={kpi.title} className={`border ${kpi.border} bg-card`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-muted-foreground font-medium">{kpi.title}</p>
                      <div className={`p-1.5 rounded-lg ${kpi.bg}`}>
                        <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                      </div>
                    </div>
                    <p className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  </CardContent>
                </Card>
              ))}
        </div>
      )}

      {/* Charts Row — Tendência Geral + Pizza */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trend Chart Geral */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Violações nos Últimos 30 Dias (Geral)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <Skeleton className="h-[200px] w-full rounded-lg" />
            ) : trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="violGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.015 250)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "oklch(0.6 0.02 250)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0.02 250)" }} />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.17 0.015 250)", border: "1px solid oklch(0.25 0.015 250)", borderRadius: "8px", color: "oklch(0.95 0.01 250)" }}
                    labelStyle={{ color: "oklch(0.6 0.02 250)" }}
                  />
                  <Area type="monotone" dataKey="violations" stroke="#f97316" fill="url(#violGrad)" strokeWidth={2} name="Violações" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                Nenhum dado disponível ainda. Execute o monitoramento para ver o gráfico.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Status das Violações
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-[200px] w-full rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={[
                    { name: "Abertas", value: stats?.open ?? 0, fill: "#f97316" },
                    { name: "Notificadas", value: stats?.notified ?? 0, fill: "#3b82f6" },
                    { name: "Resolvidas", value: stats?.resolved ?? 0, fill: "#22c55e" },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.015 250)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.6 0.02 250)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0.02 250)" }} />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.17 0.015 250)", border: "1px solid oklch(0.25 0.015 250)", borderRadius: "8px", color: "oklch(0.95 0.01 250)" }}
                  />
                  <Bar dataKey="value" name="Quantidade" radius={[4, 4, 0, 0]}>
                    <Cell fill="#f97316" />
                    <Cell fill="#3b82f6" />
                    <Cell fill="#22c55e" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Violações por Cliente (Pie) */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-cyan-400" />
              Violações por Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clientePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={clientePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    dataKey="value"
                    stroke="oklch(0.17 0.015 250)"
                    strokeWidth={2}
                  >
                    {clientePieData.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "oklch(0.17 0.015 250)", border: "1px solid oklch(0.25 0.015 250)", borderRadius: "8px", color: "oklch(0.95 0.01 250)" }}
                    formatter={(value: number, name: string) => [`${value} violações`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                Nenhuma violação por cliente ainda.
              </div>
            )}
            {clientePieData.length > 0 && (
              <div className="mt-2 space-y-1">
                {clientePieData.slice(0, 5).map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="font-medium text-foreground">{d.value}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row — Turnos 10h e 16h */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico Turno Manhã 10h */}
        <Card className="border-blue-500/20 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-400" />
              <span>Violações — Turno Manhã <span className="text-blue-400 font-bold">10h</span></span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trendSlotLoading ? (
              <Skeleton className="h-[200px] w-full rounded-lg" />
            ) : (trendSlot?.slot10 ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={(trendSlot?.slot10 ?? []).map(t => ({ date: formatDateShort(t.date), violations: t.count }))}>
                  <defs>
                    <linearGradient id="slot10Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.015 250)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "oklch(0.6 0.02 250)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0.02 250)" }} />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.17 0.015 250)", border: "1px solid oklch(0.25 0.015 250)", borderRadius: "8px", color: "oklch(0.95 0.01 250)" }}
                    labelStyle={{ color: "oklch(0.6 0.02 250)" }}
                  />
                  <Area type="monotone" dataKey="violations" stroke="#3b82f6" fill="url(#slot10Grad)" strokeWidth={2} name="Violações 10h" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                <Clock className="h-8 w-8 text-blue-400/30" />
                <span>Aguardando dados do turno das 10h.</span>
                <span className="text-xs">Próxima execução automática: hoje às 10:00 (BRT)</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico Turno Tarde 16h */}
        <Card className="border-purple-500/20 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-400" />
              <span>Violações — Turno Tarde <span className="text-purple-400 font-bold">16h</span></span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trendSlotLoading ? (
              <Skeleton className="h-[200px] w-full rounded-lg" />
            ) : (trendSlot?.slot16 ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={(trendSlot?.slot16 ?? []).map(t => ({ date: formatDateShort(t.date), violations: t.count }))}>
                  <defs>
                    <linearGradient id="slot16Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.015 250)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "oklch(0.6 0.02 250)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0.02 250)" }} />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.17 0.015 250)", border: "1px solid oklch(0.25 0.015 250)", borderRadius: "8px", color: "oklch(0.95 0.01 250)" }}
                    labelStyle={{ color: "oklch(0.6 0.02 250)" }}
                  />
                  <Area type="monotone" dataKey="violations" stroke="#a855f7" fill="url(#slot16Grad)" strokeWidth={2} name="Violações 16h" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                <Clock className="h-8 w-8 text-purple-400/30" />
                <span>Aguardando dados do turno das 16h.</span>
                <span className="text-xs">Próxima execução automática: hoje às 16:00 (BRT)</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Violations Table */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-orange-400" />
              Violações Recentes (Abertas)
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/violations")} className="text-xs text-primary hover:text-primary">
              Ver todas →
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {violationsLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : violationsError ? (
            <div className="py-8 text-center">
              <WifiOff className="h-8 w-8 mx-auto mb-2 text-red-400/40" />
              <p className="text-xs text-muted-foreground">Erro ao carregar violações</p>
              <Button variant="ghost" size="sm" onClick={() => refetchViolations()} className="mt-2 text-xs">
                Tentar novamente
              </Button>
            </div>
          ) : violations?.items && violations.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Produto</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Vendedor</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Preço Anunciado</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Preço Mínimo</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Diferença</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Detectado</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.items.map(({ v, p }) => (
                    <tr key={v.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-foreground text-xs">{p?.codigo ?? "—"}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">{v.mlTitle ?? p?.descricao ?? "—"}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-foreground">{v.sellerName}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-red-400 font-semibold text-xs">{formatCurrency(v.precoAnunciado ?? "0")}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-muted-foreground text-xs">{formatCurrency(v.precoMinimo ?? "0")}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-orange-400 font-medium text-xs">
                          -{formatCurrency(v.diferenca ?? "0")} ({parseFloat(String(v.percentAbaixo ?? 0)).toFixed(1)}%)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={v.status} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">{new Date(v.detectedAt).toLocaleDateString("pt-BR")}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-500/50" />
              <p className="font-medium text-foreground">Nenhuma violação aberta</p>
              <p className="text-xs mt-1">Execute o monitoramento para verificar os preços</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
