import { useState } from "react";
import { trpc } from "@/lib/trpc";
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

function ClienteCard({ cliente, onCheck, onEdit, onDelete }: {
  cliente: Cliente;
  onCheck: (id: number) => void;
  onEdit: (c: Cliente) => void;
  onDelete: (id: number) => void;
}) {
  const violacoes = cliente.totalViolacoes ?? 0;
  const produtos = cliente.totalProdutos ?? 0;
  const statusColor = violacoes > 0 ? "destructive" : "default";
  const statusIcon = violacoes > 0
    ? <AlertTriangle className="w-4 h-4 text-red-400" />
    : <CheckCircle className="w-4 h-4 text-green-400" />;

  return (
    <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-500 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Store className="w-5 h-5 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-white text-base truncate">{cliente.nome}</CardTitle>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
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
          <div className="bg-slate-700/50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{produtos}</p>
            <p className="text-xs text-slate-400 mt-0.5">Produtos ASX</p>
          </div>
          <div className={`rounded-lg p-3 text-center ${violacoes > 0 ? "bg-red-900/30" : "bg-slate-700/50"}`}>
            <div className="flex items-center justify-center gap-1">
              {statusIcon}
              <p className={`text-2xl font-bold ${violacoes > 0 ? "text-red-400" : "text-green-400"}`}>
                {violacoes}
              </p>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Violações</p>
          </div>
        </div>

        {/* Última verificação */}
        <p className="text-xs text-slate-500">
          {cliente.ultimaVerificacao
            ? `Verificado: ${new Date(cliente.ultimaVerificacao).toLocaleString("pt-BR")}`
            : "Nunca verificado"}
        </p>

        {/* Ações */}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => onCheck(cliente.id)}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Verificar Agora
          </Button>
          {cliente.linkLoja && (
            <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700" asChild>
              <a href={cliente.linkLoja} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3 h-3" />
              </a>
            </Button>
          )}
          <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700" onClick={() => onEdit(cliente)}>
            <Edit className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" className="border-red-800 text-red-400 hover:bg-red-900/30" onClick={() => onDelete(cliente.id)}>
            <Trash2 className="w-3 h-3" />
          </Button>
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
    linkLoja: initial?.linkLoja ?? "",
    status: initial?.status ?? "ativo",
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-slate-300">Nome do Cliente *</Label>
          <Input
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="Ex: LIDER SOM"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-300">Seller ID (Mercado Livre) *</Label>
          <Input
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="Ex: 1917431909"
            value={form.sellerId}
            onChange={(e) => setForm({ ...form, sellerId: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-slate-300">Nickname ML</Label>
          <Input
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="Ex: globalparts1"
            value={form.lojaML}
            onChange={(e) => setForm({ ...form, lojaML: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-300">Link da Loja</Label>
          <Input
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="https://..."
            value={form.linkLoja}
            onChange={(e) => setForm({ ...form, linkLoja: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-slate-300">Status</Label>
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "ativo" | "inativo" })}>
          <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-2">
        <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => onSave({ ...form, id: initial?.id })}>
          {initial?.id ? "Salvar Alterações" : "Adicionar Cliente"}
        </Button>
        <Button variant="outline" className="border-slate-600 text-slate-300" onClick={onCancel}>
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
      toast.success("Cliente salvo com sucesso!");
      setDialogOpen(false);
      setEditingCliente(null);
      refetch();
    },
    onError: () => toast.error("Erro ao salvar cliente."),
  });

  const deleteMutation = trpc.clientes.delete.useMutation({
    onSuccess: () => { toast.success("Cliente removido."); refetch(); },
    onError: () => toast.error("Erro ao remover cliente."),
  });

  const checkMutation = trpc.clientes.runCheck.useMutation({
    onSuccess: (data) => {
      setCheckingId(null);
      toast.success(`Verificação concluída! ${data.violations} violação(ões) encontrada(s).`);
      refetch();
    },
    onError: () => { setCheckingId(null); toast.error("Erro ao verificar cliente."); },
  });

  const handleCheck = (id: number) => {
    setCheckingId(id);
    toast.info("Verificando anúncios do cliente no Mercado Livre...");
    checkMutation.mutate({ clienteId: id });
  };

  const handleDelete = (id: number) => {
    if (confirm("Remover este cliente do monitoramento?")) {
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
      sellerId: data.sellerId,
      lojaML: data.lojaML || undefined,
      linkLoja: data.linkLoja || undefined,
      status: data.status,
    });
  };

  const clientes = (clientesList ?? []) as Cliente[];
  const totalViolacoes = clientes.reduce((s, c) => s + (c.totalViolacoes ?? 0), 0);
  const totalProdutos = clientes.reduce((s, c) => s + (c.totalProdutos ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            Clientes Monitorados
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Monitoramento cirúrgico por seller_id — busca direta nos anúncios de cada cliente
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingCliente(null); }}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
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
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-4 pb-4">
            <p className="text-3xl font-bold text-blue-400">{clientes.length}</p>
            <p className="text-sm text-slate-400">Clientes Cadastrados</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="pt-4 pb-4">
            <p className="text-3xl font-bold text-green-400">{totalProdutos}</p>
            <p className="text-sm text-slate-400">Produtos ASX Encontrados</p>
          </CardContent>
        </Card>
        <Card className={`border ${totalViolacoes > 0 ? "bg-red-900/20 border-red-800" : "bg-slate-800/50 border-slate-700"}`}>
          <CardContent className="pt-4 pb-4">
            <p className={`text-3xl font-bold ${totalViolacoes > 0 ? "text-red-400" : "text-slate-300"}`}>{totalViolacoes}</p>
            <p className="text-sm text-slate-400">Total de Violações</p>
          </CardContent>
        </Card>
      </div>

      {/* Cards de Clientes */}
      {clientes.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center">
            <ShoppingCart className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">Nenhum cliente cadastrado ainda.</p>
            <p className="text-slate-500 text-sm mt-1">Clique em "Adicionar Cliente" para começar.</p>
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
              />
            </div>
          ))}
        </div>
      )}

      {/* Legenda */}
      <Card className="bg-slate-800/30 border-slate-700/50">
        <CardContent className="py-3">
          <p className="text-xs text-slate-500">
            <strong className="text-slate-400">Como funciona:</strong> O scraper usa o seller_id de cada cliente para buscar diretamente seus anúncios no Mercado Livre com a query "ASX". 
            Isso é cirúrgico — pega só o que o cliente está vendendo com a marca ASX, eliminando falsos positivos.
            Além disso, uma busca geral captura vendedores não cadastrados que possam estar violando preço.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
