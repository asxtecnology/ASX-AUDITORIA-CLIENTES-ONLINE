// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, ExternalLink, Filter, Search, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: "Aberta", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    notified: { label: "Notificado", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    resolved: { label: "Resolvida", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  };
  const s = map[status] ?? { label: status, className: "" };
  return <Badge className={`text-xs border ${s.className}`}>{s.label}</Badge>;
}

export default function Violations() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clienteFilter, setClienteFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data: clientesList } = trpc.clientes.list.useQuery();

  const { data, refetch } = trpc.violations.list.useQuery({
    status: statusFilter !== "all" ? (statusFilter as "open" | "notified" | "resolved") : undefined,
    clienteId: clienteFilter !== "all" ? parseInt(clienteFilter) : undefined,
    limit,
    offset,
  });

  const updateStatus = trpc.violations.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado!");
      refetch();
    },
    onError: (err) => toast.error(err.message || "Erro ao atualizar status."),
  });

  const filtered = (data?.items ?? []).filter(({ v, p }) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (v.sellerName ?? "").toLowerCase().includes(q) ||
      (p?.codigo ?? "").toLowerCase().includes(q) ||
      (p?.descricao ?? "").toLowerCase().includes(q) ||
      (v.mlTitle ?? "").toLowerCase().includes(q)
    );
  });

  const handleExportCSV = () => {
    if (!data?.items.length) return;
    const headers = ["ID", "Produto", "Vendedor", "Preço Anunciado", "Preço Mínimo", "Diferença", "%Abaixo", "Confiança", "Método Match", "Status", "Detectado", "URL"];
    const rows = data.items.map(({ v, p }) => [
      v.id, p?.codigo ?? "", v.sellerName,
      v.precoAnunciado, v.precoMinimo, v.diferenca, v.percentAbaixo,
      v.confianca ?? 0, v.metodoMatch ?? "", v.status,
      new Date(v.detectedAt).toLocaleString("pt-BR"), v.mlUrl ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `violacoes_asx_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-orange-400" />
            Violações de Preço
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.total ?? 0} violação(ões) encontrada(s)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por produto, vendedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background border-border"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setOffset(0); }}>
                <SelectTrigger className="w-40 bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="open">Abertas</SelectItem>
                  <SelectItem value="notified">Notificadas</SelectItem>
                  <SelectItem value="resolved">Resolvidas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={clienteFilter} onValueChange={(v) => { setClienteFilter(v); setOffset(0); }}>
                <SelectTrigger className="w-48 bg-background border-border">
                  <SelectValue placeholder="Todos os clientes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os clientes</SelectItem>
                  {(clientesList ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {filtered.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Produto</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Vendedor</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Anunciado</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Mínimo</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Diferença</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Confiança</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Detectado</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(({ v, p }) => (
                      <tr key={v.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-semibold text-foreground text-xs">{p?.codigo ?? "—"}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{v.mlTitle ?? p?.descricao ?? "—"}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-foreground">{v.sellerName ?? "Desconhecido"}</p>
                          {v.sellerId && <p className="text-xs text-muted-foreground">ID: {v.sellerId}</p>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-red-400 font-bold text-sm">{formatCurrency(v.precoAnunciado ?? "0")}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-muted-foreground text-xs">{formatCurrency(v.precoMinimo ?? "0")}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-orange-400 font-medium text-xs">-{formatCurrency(v.diferenca ?? "0")}</span>
                            <span className="text-orange-400/70 text-xs">({parseFloat(String(v.percentAbaixo ?? 0)).toFixed(1)}%)</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(() => {
                            const conf = v.confianca ?? 0;
                            const color = conf >= 90 ? "text-green-400" : conf >= 70 ? "text-yellow-400" : "text-red-400";
                            const bg = conf >= 90 ? "bg-green-500/20" : conf >= 70 ? "bg-yellow-500/20" : "bg-red-500/20";
                            return (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`text-xs font-bold ${color}`}>{conf}%</span>
                                <div className="w-10 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                                  <div className={`h-full rounded-full ${bg}`} style={{ width: `${conf}%` }} />
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={v.status} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{new Date(v.detectedAt).toLocaleString("pt-BR")}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {v.mlUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => window.open(v.mlUrl!, "_blank")}
                                title="Ver no ML"
                              >
                                <ExternalLink className="h-3.5 w-3.5 text-blue-400" />
                              </Button>
                            )}
                            {v.status === "open" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => updateStatus.mutate({ id: v.id, status: "notified" })}
                                title="Marcar como notificado"
                              >
                                <CheckCircle className="h-3.5 w-3.5 text-blue-400" />
                              </Button>
                            )}
                            {v.status !== "resolved" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => updateStatus.mutate({ id: v.id, status: "resolved" })}
                                title="Marcar como resolvida"
                              >
                                <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Mostrando {offset + 1}–{Math.min(offset + limit, data?.total ?? 0)} de {data?.total ?? 0}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="text-xs">
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" disabled={offset + limit >= (data?.total ?? 0)} onClick={() => setOffset(offset + limit)} className="text-xs">
                    Próximo
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-muted-foreground">
              <ShieldAlert className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium text-foreground">Nenhuma violação encontrada</p>
              <p className="text-xs mt-1">Ajuste os filtros ou execute um novo monitoramento</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
