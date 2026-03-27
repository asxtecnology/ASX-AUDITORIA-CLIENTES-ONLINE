import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ClipboardList,
  CheckCircle,
  XCircle,
  SkipForward,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Search,
} from "lucide-react";

// ─── Review Dialog ────────────────────────────────────────────────────────────

interface ReviewItem {
  id: number;
  trackedListingId: number;
  suggestedProductId: number | null;
  confidence: string | null;
  reason: string;
  status: string;
  createdAt: Date;
  listing?: {
    mlItemId: string;
    mlUrl: string;
    mlTitle: string | null;
    mlThumbnail: string | null;
    sellerNickname: string | null;
    matchMethod: string | null;
  };
  suggestedProduct?: {
    id: number;
    codigo: string;
    descricao: string;
    precoMinimo: string;
  } | null;
}

interface ReviewDialogProps {
  item: ReviewItem;
  open: boolean;
  onClose: () => void;
  onReview: (decision: "approved" | "rejected" | "skipped", correctProductId?: number, notes?: string) => void;
  isPending: boolean;
}

function ReviewDialog({ item, open, onClose, onReview, isPending }: ReviewDialogProps) {
  const [notes, setNotes] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>(
    item.suggestedProductId ? String(item.suggestedProductId) : ""
  );

  const { data: productsData } = trpc.products.list.useQuery({ limit: 500 }, { enabled: open });
  const products = productsData?.items || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Revisar Match de Produto
          </DialogTitle>
          <DialogDescription>
            Este anúncio foi detectado com confiança baixa ({item.confidence}%). Confirme ou corrija o produto correspondente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Listing info */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Anúncio</p>
            <div className="flex items-start gap-3">
              {item.listing?.mlThumbnail && (
                <img
                  src={item.listing.mlThumbnail}
                  alt=""
                  className="h-12 w-12 rounded object-cover shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.listing?.mlTitle || item.listing?.mlItemId}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Vendedor: {item.listing?.sellerNickname || "—"} · Método: {item.listing?.matchMethod || "—"}
                </p>
                {item.listing?.mlUrl && (
                  <a
                    href={item.listing.mlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver no Mercado Livre
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Suggested product */}
          {item.suggestedProduct && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50/50 p-3 space-y-1">
              <p className="text-xs font-medium text-yellow-700 uppercase tracking-wide">Produto Sugerido (IA)</p>
              <p className="text-sm font-mono font-medium">{item.suggestedProduct.codigo}</p>
              <p className="text-sm text-muted-foreground">{item.suggestedProduct.descricao}</p>
              <p className="text-xs text-muted-foreground">
                Preço mínimo: R$ {parseFloat(item.suggestedProduct.precoMinimo).toFixed(2).replace(".", ",")}
              </p>
            </div>
          )}

          {/* Reason */}
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Motivo da revisão</p>
            <p className="text-sm">{item.reason}</p>
          </div>

          {/* Product selector */}
          <div className="space-y-2">
            <Label className="text-sm">Produto correto (opcional)</Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar produto do catálogo..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {products.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    <span className="font-mono text-xs mr-2">{p.codigo}</span>
                    <span className="text-xs text-muted-foreground">{p.descricao?.substring(0, 50)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm">Observações (opcional)</Label>
            <Textarea
              placeholder="Ex: Produto correto é o H7 35W, não o H11..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onReview("skipped", undefined, notes)}
            disabled={isPending}
            className="gap-1"
          >
            <SkipForward className="h-4 w-4" />
            Pular
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onReview("rejected", undefined, notes)}
            disabled={isPending}
            className="gap-1"
          >
            <XCircle className="h-4 w-4" />
            Rejeitar (sem produto)
          </Button>
          <Button
            size="sm"
            onClick={() => onReview("approved", selectedProductId ? parseInt(selectedProductId) : undefined, notes)}
            disabled={isPending}
            className="gap-1"
          >
            {isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Aprovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReviewQueue() {
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const utils = trpc.useUtils();

  const { data: pendingItems, isLoading, refetch } = trpc.review.getPending.useQuery(
    { limit: 50 },
    { refetchInterval: 30000 }
  );

  const reviewMutation = trpc.review.review.useMutation({
    onSuccess: (_, vars) => {
      const labels = { approved: "aprovado", rejected: "rejeitado", skipped: "pulado" };
      toast.success(`Item ${labels[vars.decision]} com sucesso`);
      setSelectedItem(null);
      utils.review.getPending.invalidate();
      utils.review.getCount.invalidate();
      utils.tracked.getListings.invalidate();
      utils.tracked.getStats.invalidate();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const items = (pendingItems || []) as ReviewItem[];

  function handleReview(
    decision: "approved" | "rejected" | "skipped",
    correctProductId?: number,
    notes?: string
  ) {
    if (!selectedItem) return;
    reviewMutation.mutate({
      itemId: selectedItem.id,
      decision,
      correctProductId,
      notes,
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Fila de Revisão de Match
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Anúncios com confiança de match abaixo de 80% aguardando confirmação manual
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Stats banner */}
      {!isLoading && items.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
          <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
          <p className="text-sm text-yellow-700">
            <span className="font-semibold">{items.length} anúncio(s)</span> aguardando revisão manual.
            Revise para garantir a precisão do monitoramento de preços.
          </p>
        </div>
      )}

      {/* Items grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle className="h-12 w-12 text-green-500/30 mb-3" />
            <p className="text-muted-foreground font-medium">Fila vazia</p>
            <p className="text-xs text-muted-foreground mt-1">
              Todos os matches foram revisados. Bom trabalho!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedItem(item)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm truncate">
                      {item.listing?.mlTitle || item.listing?.mlItemId || `Item #${item.id}`}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {item.listing?.sellerNickname || "Vendedor desconhecido"}
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 text-xs bg-yellow-50 text-yellow-700 border-yellow-200"
                  >
                    {item.confidence ? `${parseFloat(item.confidence).toFixed(0)}%` : "?"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {item.listing?.mlThumbnail && (
                  <img
                    src={item.listing.mlThumbnail}
                    alt=""
                    className="h-16 w-full object-cover rounded"
                  />
                )}
                {item.suggestedProduct && (
                  <div className="text-xs bg-muted/50 rounded p-2">
                    <span className="text-muted-foreground">Sugestão: </span>
                    <span className="font-mono font-medium">{item.suggestedProduct.codigo}</span>
                    <span className="text-muted-foreground ml-1">— {item.suggestedProduct.descricao?.substring(0, 40)}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground line-clamp-2">{item.reason}</p>
                <Button
                  size="sm"
                  className="w-full h-7 text-xs gap-1"
                  onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}
                >
                  <Search className="h-3 w-3" />
                  Revisar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      {selectedItem && (
        <ReviewDialog
          item={selectedItem}
          open={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          onReview={handleReview}
          isPending={reviewMutation.isPending}
        />
      )}
    </div>
  );
}
