import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAdmin } from "@/hooks/useAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Users, Plus, RefreshCw, ExternalLink, AlertTriangle,
  CheckCircle, Trash2, Edit, Store, ShoppingCart,
} from "lucide-react";

type Cliente = {
  id: number;
  nome: string;
  sellerId: string;
  lojaML: string | null;
  linkLoja: string | null;
  status: "ativo" | "inativo";
  totalProdutos: number | null;
  totalViolacoes: number | null;
  ultimaVerificacao: Date | null;
};

/**
 * Gera a URL da loja do cliente no Mercado Livre.
 * Prioridade:
 *   1. sellerId numérico → lista.mercadolivre.com.br/_CustId_{id}
 *   2. lojaML nickname → lista.mercadolivre.com.br/_Loja_{nick}
 *   3. linkLoja explícito (somente se NÃO for /perfil/)
 *   4. sellerId não numérico (nickname direto)
 *   5. null
 */
function buildClienteStoreUrl(cliente: Cliente): string | null {
  if (cliente.sellerId && /^\d+$/.test(cliente.sellerId)) {
    return `https://lista.mercadolivre.com.br/_CustId_${cliente.sellerId}`;
  }
  if (cliente.lojaML && cliente.lojaML !== "NULL" && cliente.lojaML.trim() !== "") {
    return `https://lista.mercadolivre.com.br/_Loja_${cliente.lojaML}`;
  }
  if (cliente.linkLoja && !cliente.linkLoja.includes("/perfil/")) {
    return cliente.linkLoja;
  }
  if (cliente.sellerId && cliente.sellerId.trim() !== "") {
    return `https://lista.mercadolivre.com.br/_Loja_${cliente.sellerId}`;
  }
  return null;
}

function ClienteCard({ cliente, onCheck, onEdit, onDelete, isAdmin }: {
  cliente: Cliente;
  onCheck: (id: number) => void;
  onEdit: (c: Cliente) => void;
  onDelete: (id: number) => void;
  isAdmin: boolean;
}) {
  const violacoes = cliente.totalViolacoes ?? 0;
  const produtos = cliente.totalProdutos ?? 0;
  const statusColor = violacoes > 0 ? "destructive" : "default";
  const statusIcon = violacoes > 0
    ? <AlertTriangle className="w-4 h-4 text-red-400" />
    : <CheckCircle className="w-4 h-4 text-green-400" />;

  return (
    <Card className="bg-card border-border hover:border-border transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Store className="w-5 h-5 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-foreground text-base truncate">{cliente.nome}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                ID: {cliente.sellerId}
              </p>
            </div>
          </div>
          <Badge variant={cliente.status === "ativo" ? "default" : "secondary"} className="shrink-0">
            {cliente.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-accent rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{produtos}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Produtos ASX</p>
          </div>
          <div className={`rounded-lg p-3 text-center ${violacoes > 0 ? "bg-red-900/30" : "bg-accent"}`}>
            <div className="flex items-center justify-center gap-1">
              {statusIcon}
              <p className={`text-2xl font-bold ${violacoes > 0 ? "text-red-400" : "text-green-400"}`}>
                {violacoes}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Violações</p>
          </div>
        </div>

        {/* Última verificação */}
        <p className="text-xs text-muted-foreground">
          {cliente.ultimaVerificacao
            ? `Verificado: ${new Date(cliente.ultimaVerificacao).toLocaleString("pt-BR")}`
            : "Nunca verificado"}
        </p>

        {/* Ações — layout organizado em duas linhas */}
        <div className="space-y-2">
          {/* Linha 1: Verificar Agora (largura total) */}
          <Button
            size="sm"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => onCheck(cliente.id)}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Verificar Agora
          </Button>

          {/* Linha 2: Ações secundárias (grid fixo, sem overflow) */}
          {(() => {
            const storeUrl = buildClienteStoreUrl(cliente);
            return (
              <div className="grid grid-cols-3 gap-2">
                {storeUrl ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    asChild
                  >
                    <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Loja
                    </a>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-700 text-slate-500 cursor-not-allowed opacity-50"
                    disabled
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Loja
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  onClick={() => onEdit(cliente)}
                >
                  <Edit className="w-3 h-3 mr-1" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-800/60 text-red-400 hover:bg-red-900/30"
                  onClick={() => onDelete(cliente.id)}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Excluir
                </Button>
              </div>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
}

function ClienteForm({ initial, onSave, onCancel }: {
  initial?: Partial<Cliente>;
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? "",
    sellerId: initial?.sellerId ?? "",
    lojaML: initial?.lojaML ?? "",
    status: initial?.status ?? "ativo",
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Nome do Revendedor *</Label>
          <Input
            className="bg-accent border-border text-foreground"
            placeholder="Ex: LIDER SOM"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Seller ID (Mercado Livre) *</Label>
          <Input
            className="bg-accent border-border text-foreground"
            placeholder="Ex: 1917431909"
            value={form.sellerId}
            onChange={(e) => setForm({ ...form, sellerId: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Nickname ML</Label>
          <Input
            className="bg-accent border-border text-foreground"
            placeholder="Ex: globalparts1"
            value={form.lojaML}
            onChange={(e) => setForm({ ...form, lojaML: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Email</Label>
          <Input
            className="bg-accent border-border text-foreground"
            placeholder="email@exemplo.com"
            value={(form as any).email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value } as any)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-muted-foreground">Status</Label>
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "ativo" | "inativo" })}>
          <SelectTrigger className="bg-accent border-border text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-2">
        <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => onSave({ ...form, id: initial?.id })}>
          {initial?.id ? "Salvar Alterações" : "Adicionar Revendedor"}
        </Button>
        <Button variant="outline" className="border-border text-muted-foreground" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export default function Clientes() {
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkingId, setCheckingId] = useState<number | null>(null);

  const { data: clientesList, refetch } = trpc.clientes.list.useQuery();
  const utils = trpc.useUtils();

  const upsertMutation = trpc.clientes.upsert.useMutation({
    onSuccess: () => {
      toast.success("Revendedor salvo com sucesso!");
      setDialogOpen(false);
      setEditingCliente(null);
      refetch();
    },
    onError: (err) => toast.error(err.message || "Erro ao salvar revendedor."),
  });

  const deleteMutation = trpc.clientes.delete.useMutation({
    onSuccess: () => { toast.success("Revendedor removido."); refetch(); },
    onError: (err) => toast.error(err.message || "Erro ao remover revendedor."),
  });

  const checkMutation = trpc.clientes.runCheck.useMutation({
    onSuccess: (data) => {
      setCheckingId(null);
      toast.success(`Verificação concluída! ${data.violations} violação(ões) encontrada(s).`);
      refetch();
    },
    onError: (err) => { setCheckingId(null); toast.error(err.message || "Erro ao verificar revendedor."); },
  });

  const handleCheck = (id: number) => {
    setCheckingId(id);
    toast.info("Verificando anúncios do revendedor no Mercado Livre...");
    checkMutation.mutate({ clienteId: id });
  };

  const handleDelete = (id: number) => {
    if (confirm("Remover este revendedor do monitoramento?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleEdit = (c: Cliente) => {
    setEditingCliente(c);
    setDialogOpen(true);
  };

  const handleSave = (data: any) => {
    upsertMutation.mutate({
      id: data.id,
      nome: data.nome,
      sellerId: data.sellerId || data.sellerId,
      lojaML: data.lojaML || data.lojaML || undefined,
      status: data.status,
    });
  };

  const clientes = (clientesList ?? []) as unknown as Cliente[];
  const { isAdmin } = useAdmin();
  const totalViolacoes = clientes.reduce((s, c) => s + (c.totalViolacoes ?? 0), 0);
  const totalProdutos = clientes.reduce((s, c) => s + (c.totalProdutos ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            Revendedores ASX
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitoramento cirúrgico por seller_id — busca direta nos anúncios de cada cliente
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingCliente(null); }}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-foreground">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Revendedor
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border text-foreground max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingCliente ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            </DialogHeader>
            <ClienteForm
              initial={editingCliente ?? undefined}
              onSave={handleSave}
              onCancel={() => { setDialogOpen(false); setEditingCliente(null); }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-3xl font-bold text-blue-400">{clientes.length}</p>
            <p className="text-sm text-muted-foreground">Revendedores Cadastrados</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <p className="text-3xl font-bold text-green-400">{totalProdutos}</p>
            <p className="text-sm text-muted-foreground">Produtos ASX Encontrados</p>
          </CardContent>
        </Card>
        <Card className={`border ${totalViolacoes > 0 ? "bg-red-900/20 border-red-800" : "bg-card border-border"}`}>
          <CardContent className="pt-4 pb-4">
            <p className={`text-3xl font-bold ${totalViolacoes > 0 ? "text-red-400" : "text-muted-foreground"}`}>{totalViolacoes}</p>
            <p className="text-sm text-muted-foreground">Total de Violações</p>
          </CardContent>
        </Card>
      </div>

      {/* Cards de Clientes */}
      {clientes.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <ShoppingCart className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum revendedor cadastrado ainda.</p>
            <p className="text-muted-foreground text-sm mt-1">Clique em "Adicionar Revendedor" para começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {clientes.map((c) => (
            <div key={c.id} className={checkingId === c.id ? "opacity-60 pointer-events-none" : ""}>
              <ClienteCard
                cliente={c}
                onCheck={handleCheck}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isAdmin={isAdmin}
              />
            </div>
          ))}
        </div>
      )}

      {/* Legenda */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="py-3">
          <p className="text-xs text-muted-foreground">
            <strong className="text-muted-foreground">Como funciona:</strong> O scraper usa o seller_id de cada revendedor para buscar diretamente seus anúncios no Mercado Livre com a query "ASX". 
            Isso é cirúrgico — pega só o que o revendedor está vendendo com a marca ASX, eliminando falsos positivos.
            Além disso, uma busca geral captura vendedores não cadastrados que possam estar violando preço.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
