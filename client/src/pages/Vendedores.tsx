import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp, AlertTriangle, Search, ShoppingBag, ExternalLink } from "lucide-react";

export default function Vendedores() {
  const [search, setSearch] = useState("");
  const [orderBy, setOrderBy] = useState<"total_violacoes" | "total_anuncios">("total_violacoes");

  const { data: vendedoresData } = trpc.vendedores.list.useQuery({ limit: 50, offset: 0, orderBy });

  const items = (vendedoresData?.items ?? []) as unknown as Array<{
    v: {
      id: number;
      plataforma: string;
      vendedorId: string | null;
      nome: string;
      clienteId: number | null;
      totalViolacoes: number | null;
      totalAnuncios: number | null;
      ultimaVez: Date | null;
    };
    c: { nome: string } | null;
  }>;

  const filtered = items.filter((row) =>
    !search || row.v.nome.toLowerCase().includes(search.toLowerCase())
  );

  const top10 = filtered.slice(0, 10).map((row) => ({
    nome: row.v.nome.length > 15 ? row.v.nome.slice(0, 15) + "…" : row.v.nome,
    violacoes: row.v.totalViolacoes,
    anuncios: row.v.totalAnuncios,
  }));

  const totalViolacoes = items.reduce((s, r) => s + (r.v.totalViolacoes ?? 0), 0);
  const totalAnuncios = items.reduce((s, r) => s + (r.v.totalAnuncios ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-orange-400" />
          Ranking de Vendedores
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Todos os vendedores detectados com produtos ASX — ordenados por violações
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-3xl font-bold text-blue-400">{items.length}</p>
            <p className="text-sm text-muted-foreground">Vendedores Detectados</p>
          </CardContent>
        </Card>
        <Card className="bg-red-900/20 border-red-800">
          <CardContent className="pt-4 pb-4">
            <p className="text-3xl font-bold text-red-400">{totalViolacoes}</p>
            <p className="text-sm text-muted-foreground">Total de Violações</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-3xl font-bold text-green-400">{totalAnuncios}</p>
            <p className="text-sm text-muted-foreground">Anúncios Monitorados</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico Top 10 */}
      {top10.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground text-base">Top 10 Violadores</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={top10} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="nome" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: "8px" }}
                  labelStyle={{ color: "#f1f5f9" }}
                  itemStyle={{ color: "#94a3b8" }}
                />
                <Bar dataKey="violacoes" name="Violações" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="anuncios" name="Anúncios" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 bg-card border-border text-foreground"
            placeholder="Buscar vendedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={orderBy === "total_violacoes" ? "default" : "outline"}
            className={orderBy === "total_violacoes" ? "bg-blue-600" : "border-border text-muted-foreground"}
            onClick={() => setOrderBy("total_violacoes")}
          >
            Por Violações
          </Button>
          <Button
            size="sm"
            variant={orderBy === "total_anuncios" ? "default" : "outline"}
            className={orderBy === "total_anuncios" ? "bg-blue-600" : "border-border text-muted-foreground"}
            onClick={() => setOrderBy("total_anuncios")}
          >
            Por Anúncios
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <ShoppingBag className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum vendedor detectado ainda.</p>
              <p className="text-muted-foreground text-sm mt-1">Execute o monitoramento para capturar vendedores.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">#</TableHead>
                  <TableHead className="text-muted-foreground">Vendedor</TableHead>
                  <TableHead className="text-muted-foreground">Plataforma</TableHead>
                  <TableHead className="text-muted-foreground">Cliente ASX</TableHead>
                  <TableHead className="text-muted-foreground text-right">Anúncios</TableHead>
                  <TableHead className="text-muted-foreground text-right">Violações</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Última Atualização</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row, idx) => {
                  const v = row.v;
                  const hasViolations = (v.totalViolacoes ?? 0) > 0;
                  return (
                    <TableRow key={v.id} className="border-border hover:bg-accent/50">
                      <TableCell className="text-muted-foreground font-mono text-sm">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-medium">{v.nome}</span>
                          {v.vendedorId && (
                            <a
                              href={`https://lista.mercadolivre.com.br/_CustId_${v.vendedorId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-blue-400"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">ID: {v.vendedorId}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                          {v.plataforma}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.c ? (
                          <span className="text-blue-400 text-sm">{row.c.nome}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm italic">Desconhecido</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{v.totalAnuncios}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-bold ${hasViolations ? "text-red-400" : "text-green-400"}`}>
                          {v.totalViolacoes}
                        </span>
                      </TableCell>
                      <TableCell>
                        {hasViolations ? (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Violador
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-green-700 text-green-400 text-xs">
                            OK
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {v.ultimaVez ? new Date(v.ultimaVez).toLocaleString("pt-BR") : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
