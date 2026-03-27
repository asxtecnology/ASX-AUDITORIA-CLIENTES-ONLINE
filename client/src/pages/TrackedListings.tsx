import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Eye,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  TrendingDown,
  Activity,
  Download,
} from "lucide-react";

// ─── Status helpers ───────────────────────────────────────────────────────────

type ListingStatus = "novo" | "monitorado" | "suspeito" | "violador" | "inativo";

const STATUS_CONFIG: Record<ListingStatus, { label: string; color: string; icon: React.ElementType }> = {
  novo: { label: "Novo", color: "bg-blue-500/10 text-blue-600 border-blue-200", icon: Clock },
  monitorado: { label: "Monitorado", color: "bg-green-500/10 text-green-600 border-green-200", icon: CheckCircle },
  suspeito: { label: "Suspeito", color: "bg-yellow-500/10 text-yellow-600 border-yellow-200", icon: AlertTriangle },
  violador: { label: "Violador", color: "bg-red-500/10 text-red-600 border-red-200", icon: XCircle },
  inativo: { label: "Inativo", color: "bg-gray-500/10 text-gray-500 border-gray-200", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as ListingStatus] || STATUS_CONFIG.novo;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`gap-1 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function formatPrice(price: string | null | undefined) {
  if (!price) return "—";
  return `R$ ${parseFloat(price).toFixed(2).replace(".", ",")}`;
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Stats Cards ──────────────────────────────────────────────────────────────

function StatsCards() {
  const { data: stats, isLoading } = trpc.tracked.getStats.useQuery(undefined, { refetchInterval: 30000 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-8 bg-muted rounded w-12 mb-1" />
              <div className="h-4 bg-muted rounded w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { label: "Total", value: stats.total, color: "text-foreground", bg: "bg-card" },
    { label: "Monitorados", value: stats.monitorados, color: "text-green-600", bg: "bg-green-500/5" },
    { label: "Suspeitos", value: stats.suspeitos, color: "text-yellow-600", bg: "bg-yellow-500/5" },
    { label: "Violadores", value: stats.violadores, color: "text-red-600", bg: "bg-red-500/5" },
    { label: "Revisão Pendente", value: stats.reviewPending, color: "text-blue-600", bg: "bg-blue-500/5" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className={`${card.bg} border`}>
          <CardContent className="p-4">
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Check History Dialog ─────────────────────────────────────────────────────

function CheckHistoryDialog({ listingId, open, onClose }: { listingId: number; open: boolean; onClose: () => void }) {
  const { data: checks, isLoading } = trpc.tracked.getChecks.useQuery(
    { trackedListingId: listingId, limit: 20 },
    { enabled: open }
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de Verificações</DialogTitle>
          <DialogDescription>Últimas 20 verificações do anúncio</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !checks?.length ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma verificação registrada ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead>Evidência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.map((check: any) => (
                <TableRow key={check.id}>
                  <TableCell className="text-xs">{formatDate(check.checkedAt)}</TableCell>
                  <TableCell className="font-mono text-sm">{formatPrice(check.observedPrice)}</TableCell>
                  <TableCell>
                    {check.violationStatus === "violation" ? (
                      <Badge variant="destructive" className="text-xs">Violação</Badge>
                    ) : check.violationStatus === "unavailable" ? (
                      <Badge variant="secondary" className="text-xs">Indisponível</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-200">OK</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{check.checkSource}</TableCell>
                  <TableCell>
                    {check.evidenceUrl || check.screenshotUrl ? (
                      <a
                        href={check.evidenceUrl || check.screenshotUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs"
                      >
                        <ExternalLink className="h-3 w-3 inline mr-1" />
                        Ver
                      </a>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrackedListings() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.tracked.getListings.useQuery(
    statusFilter !== "all" ? { status: statusFilter, limit: 100 } : { limit: 100 },
    { refetchInterval: 60000 }
  );

  const promoteMutation = trpc.tracked.promoteFromIngestion.useMutation({
    onSuccess: (result) => {
      toast.success(`Promoção concluída: ${result.promoted} novos anúncios, ${result.alreadyTracked} já monitorados`);
      utils.tracked.getListings.invalidate();
      utils.tracked.getStats.invalidate();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const inactivateMutation = trpc.tracked.inactivate.useMutation({
    onSuccess: () => {
      toast.success("Anúncio inativado com sucesso");
      utils.tracked.getListings.invalidate();
      utils.tracked.getStats.invalidate();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const listings = data?.listings || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Eye className="h-6 w-6 text-primary" />
            Anúncios Monitorados
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rastreamento contínuo de anúncios conhecidos dos revendedores
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Button
            size="sm"
            onClick={() => promoteMutation.mutate({ sinceHours: 48, limit: 500 })}
            disabled={promoteMutation.isPending}
            className="gap-1"
          >
            {promoteMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Importar da Ingestão
          </Button>
        </div>
      </div>

      {/* Stats */}
      <StatsCards />

      {/* Lifecycle explanation */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Ciclo de vida:</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-blue-500" /> Novo</span>
            <span className="text-muted-foreground">→</span>
            <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Monitorado</span>
            <span className="text-muted-foreground">→</span>
            <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-yellow-500" /> Suspeito (1ª violação)</span>
            <span className="text-muted-foreground">→</span>
            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" /> Violador (2+ consecutivas)</span>
            <span className="text-muted-foreground">→</span>
            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-gray-400" /> Inativo</span>
          </div>
        </CardContent>
      </Card>

      {/* Filter + Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Lista de Anúncios</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="novo">Novo</SelectItem>
                <SelectItem value="monitorado">Monitorado</SelectItem>
                <SelectItem value="suspeito">Suspeito</SelectItem>
                <SelectItem value="violador">Violador</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Eye className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum anúncio monitorado</p>
              <p className="text-xs text-muted-foreground mt-1">
                Clique em "Importar da Ingestão" para promover anúncios coletados pela extensão.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">ID</TableHead>
                    <TableHead>Anúncio</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Produto ASX</TableHead>
                    <TableHead>Último Preço</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Violações</TableHead>
                    <TableHead>Última Verif.</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listings.map((listing: any) => (
                    <TableRow key={listing.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs text-muted-foreground">{listing.id}</TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2 max-w-xs">
                          {listing.mlThumbnail && (
                            <img
                              src={listing.mlThumbnail}
                              alt=""
                              className="h-8 w-8 rounded object-cover shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate leading-tight">
                              {listing.mlTitle || listing.mlItemId}
                            </p>
                            <a
                              href={listing.mlUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-0.5 mt-0.5"
                            >
                              <ExternalLink className="h-2.5 w-2.5" />
                              {listing.mlItemId}
                            </a>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <p className="font-medium">{listing.sellerNickname || "—"}</p>
                          <p className="text-muted-foreground">{listing.sellerId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {listing.matchedProductCode ? (
                          <div className="text-xs">
                            <p className="font-mono font-medium">{listing.matchedProductCode}</p>
                            <p className="text-muted-foreground">{listing.matchConfidence}% confiança</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem match</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{formatPrice(listing.lastPrice)}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={listing.listingStatus} />
                      </TableCell>
                      <TableCell>
                        {(listing.consecutiveViolations || 0) > 0 ? (
                          <div className="flex items-center gap-1 text-red-600">
                            <TrendingDown className="h-3 w-3" />
                            <span className="text-xs font-medium">{listing.consecutiveViolations}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{listing.totalChecks || 0} checks</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{formatDate(listing.lastCheckedAt)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Ver histórico de verificações"
                            onClick={() => setSelectedListingId(listing.id)}
                          >
                            <Activity className="h-3.5 w-3.5" />
                          </Button>
                          {listing.listingStatus !== "inativo" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              title="Inativar anúncio"
                              onClick={() => {
                                if (confirm("Inativar este anúncio?")) {
                                  inactivateMutation.mutate({ id: listing.id, reason: "Inativado manualmente" });
                                }
                              }}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Documentation */}
      <Card className="border-dashed border-primary/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Endpoint para a Extensão Chrome
          </CardTitle>
          <CardDescription>
            A extensão deve enviar verificações para o endpoint abaixo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="checks">
            <TabsList className="h-8 text-xs">
              <TabsTrigger value="checks" className="text-xs">POST /ml-checks</TabsTrigger>
              <TabsTrigger value="recheck" className="text-xs">GET /recheck</TabsTrigger>
            </TabsList>
            <TabsContent value="checks" className="mt-3">
              <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto font-mono">
{`POST /api/ingest/ml-checks
X-Api-Key: asx-ingest-2026

{
  "source": "browser_extension",
  "checks": [
    {
      "mlItemId": "MLB123456789",
      "observedPrice": 89.90,
      "observedTitle": "Lâmpada ASX Ultra LED H7",
      "observedAvailable": true,
      "checkSource": "browser_extension",
      "evidenceUrl": "https://www.mercadolivre.com.br/..."
    }
  ]
}`}
              </pre>
            </TabsContent>
            <TabsContent value="recheck" className="mt-3">
              <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto font-mono">
{`GET /api/tracked/recheck?limit=100&staleSinceHours=6
X-Api-Key: asx-ingest-2026

// Retorna lista de anúncios que precisam ser verificados:
// - status: suspeito, violador ou monitorado
// - sem verificação há mais de 6 horas`}
              </pre>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Check History Dialog */}
      {selectedListingId && (
        <CheckHistoryDialog
          listingId={selectedListingId}
          open={!!selectedListingId}
          onClose={() => setSelectedListingId(null)}
        />
      )}
    </div>
  );
}
