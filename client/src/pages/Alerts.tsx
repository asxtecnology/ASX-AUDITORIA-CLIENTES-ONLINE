import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Bell, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Alerts() {
  const [newEmails, setNewEmails] = useState("");
  const [minViolacoes, setMinViolacoes] = useState(1);
  const [incluirResumo, setIncluirResumo] = useState(true);

  const { data: configs, refetch } = trpc.alerts.list.useQuery();

  const upsert = trpc.alerts.upsert.useMutation({
    onSuccess: () => { toast.success("Alerta salvo!"); refetch(); setNewEmails(""); },
    onError: (err) => toast.error(err.message || "Erro ao salvar alerta."),
  });

  const deleteAlert = trpc.alerts.delete.useMutation({
    onSuccess: () => { toast.success("Alerta removido!"); refetch(); },
    onError: (err) => toast.error(err.message || "Erro ao remover."),
  });

  const handleAdd = () => {
    if (!newEmails) { toast.error("Informe ao menos um email."); return; }
    upsert.mutate({
      emailsDestinatarios: newEmails,
      frequencia: "immediate",
      minViolacoes,
      incluirResumo,
      ativo: true,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bell className="h-6 w-6 text-yellow-400" />
          Configuracao de Alertas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie os destinatarios de notificacoes automaticas por email
        </p>
      </div>

      {/* Info Card */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Bell className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-400">Como funcionam os alertas</p>
              <p className="text-xs text-muted-foreground mt-1">
                Quando o monitoramento detectar violacoes de preco minimo, os destinatarios configurados abaixo receberao uma notificacao automatica via sistema. O monitoramento executa diariamente as 14h.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add New Alert */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Adicionar Configuracao de Alerta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Emails destinatarios (separados por virgula) *</label>
              <Input
                type="text"
                placeholder="email1@exemplo.com, email2@exemplo.com"
                value={newEmails}
                onChange={(e) => setNewEmails(e.target.value)}
                className="bg-background border-border"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Minimo de violacoes para alertar</label>
                <Input
                  type="number"
                  min={1}
                  value={minViolacoes}
                  onChange={(e) => setMinViolacoes(Number(e.target.value))}
                  className="bg-background border-border"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={incluirResumo} onCheckedChange={setIncluirResumo} />
            <div>
              <p className="text-xs font-medium text-foreground">Incluir resumo</p>
              <p className="text-xs text-muted-foreground">Enviar resumo detalhado das violacoes no alerta</p>
            </div>
          </div>
          <Button onClick={handleAdd} disabled={upsert.isPending} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Alerta
          </Button>
        </CardContent>
      </Card>

      {/* Existing Alerts */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Alertas Configurados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {configs && configs.length > 0 ? (
            <div className="divide-y divide-border">
              {configs.map((cfg) => (
                <div key={cfg.id} className="flex items-center justify-between px-4 py-3 hover:bg-accent/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${cfg.ativo ? "bg-green-400" : "bg-muted-foreground"}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{cfg.emailsDestinatarios || "Sem emails"}</p>
                      <p className="text-xs text-muted-foreground">
                        Min. {cfg.minViolacoes ?? 1} violacao(oes) | Frequencia: {cfg.frequencia ?? "immediate"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {cfg.incluirResumo && (
                      <Badge className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">Resumo</Badge>
                    )}
                    <Badge className={`text-xs border ${cfg.ativo ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
                      {cfg.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                      onClick={() => deleteAlert.mutate({ id: cfg.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium text-foreground">Nenhum alerta configurado</p>
              <p className="text-xs mt-1">Adicione emails acima para receber alertas</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
