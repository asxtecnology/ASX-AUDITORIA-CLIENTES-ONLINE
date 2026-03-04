import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BookOpen, Package, Search, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { toast } from "sonner";

export default function Catalog() {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const { isAdmin } = useAdmin();
  const limit = 30;

  const { data, refetch } = trpc.products.list.useQuery({ search: search || undefined, limit, offset });

  const toggleActive = trpc.products.toggleActive.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); refetch(); },
    onError: (err) => toast.error(err.message || "Erro ao atualizar."),
  });

  const updateProduct = trpc.products.update.useMutation({
    onSuccess: () => { toast.success("Produto atualizado!"); setEditingId(null); refetch(); },
    onError: (err) => toast.error(err.message || "Erro ao salvar."),
  });

  const importProducts = trpc.products.import.useMutation({
    onSuccess: (r) => { toast.success(`Importados: ${r.imported}, Ignorados: ${r.skipped}`); refetch(); },
    onError: (err) => toast.error(err.message || "Erro na importação."),
  });

  const handleSaveEdit = (id: number) => {
    const vals: Record<string, string | undefined> = {};
    if (editValues.precoCusto) vals.precoCusto = editValues.precoCusto;
    if (editValues.precoMinimo) vals.precoMinimo = editValues.precoMinimo;
    if (editValues.descricao) vals.descricao = editValues.descricao;
    updateProduct.mutate({ id, ...vals });
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter(Boolean);
      const headers = lines[0].split(";").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""));
      const rows = lines.slice(1).map((line) => {
        const cols = line.split(";");
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (cols[i] ?? "").trim().replace(/"/g, ""); });
        return obj;
      });
      const products = rows
        .filter((r) => r.codigo && r.descricao && r.precocusto)
        .map((r) => {
          const custo = parseFloat((r.precocusto || r.preco_custo || "0").replace(",", "."));
          const margem = parseFloat((r.margem || r.margempercent || "60").replace(",", ".")) || 60;
          const minimo = parseFloat((r.precominimo || r.preco_minimo || "0").replace(",", ".")) || custo * (1 + margem / 100);
          return {
            codigo: r.codigo,
            descricao: r.descricao,
            ean: r.ean || undefined,
            precoCusto: custo.toFixed(2),
            precoMinimo: minimo.toFixed(2),
            margemPercent: margem.toFixed(2),
          };
        });
      if (products.length === 0) { toast.error("Nenhum produto válido encontrado no CSV."); return; }
      toast.info(`Importando ${products.length} produtos...`);
      importProducts.mutate(products);
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-blue-400" />
            Catálogo de Produtos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{data?.total ?? 0} produtos cadastrados</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVImport} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" /> Importar CSV
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código ou descrição..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
              className="pl-9 bg-background border-border"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {data?.items && data.items.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Código</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Descrição</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Custo</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Preço Mínimo</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Margem</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Ativo</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((p) => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-primary">{p.codigo}</span>
                        </td>
                        <td className="px-4 py-3">
                          {editingId === p.id ? (
                            <Input
                              value={editValues.descricao ?? p.descricao}
                              onChange={(e) => setEditValues((v) => ({ ...v, descricao: e.target.value }))}
                              className="h-7 text-xs bg-background"
                            />
                          ) : (
                            <p className="text-xs text-foreground truncate max-w-[250px]">{p.descricao}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editingId === p.id ? (
                            <Input
                              value={editValues.precoCusto ?? String(p.precoCusto ?? "0")}
                              onChange={(e) => setEditValues((v) => ({ ...v, precoCusto: e.target.value }))}
                              className="h-7 text-xs bg-background w-24 ml-auto"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">{formatCurrency(p.precoCusto ?? "0")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editingId === p.id ? (
                            <Input
                              value={editValues.precoMinimo ?? String(p.precoMinimo)}
                              onChange={(e) => setEditValues((v) => ({ ...v, precoMinimo: e.target.value }))}
                              className="h-7 text-xs bg-background w-24 ml-auto"
                            />
                          ) : (
                            <span className="text-xs font-semibold text-green-400">{formatCurrency(p.precoMinimo)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            {parseFloat(String(p.margemPercent)).toFixed(0)}%
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch
                            checked={p.ativo}
                            onCheckedChange={(v) => toggleActive.mutate({ id: p.id, ativo: v })}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {editingId === p.id ? (
                            <div className="flex gap-1 justify-center">
                              <Button size="sm" className="h-7 text-xs px-2" onClick={() => handleSaveEdit(p.id)}>Salvar</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingId(null)}>Cancelar</Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditingId(p.id); setEditValues({}); }}
                            >
                              Editar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Mostrando {offset + 1}–{Math.min(offset + limit, data.total)} de {data.total}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="text-xs">
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)} className="text-xs">
                    Próximo
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium text-foreground">Nenhum produto encontrado</p>
              <p className="text-xs mt-1">Importe um CSV para começar</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
