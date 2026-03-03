import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const SETTING_LABELS: Record<string, { label: string; description: string; type: "number" | "boolean" | "text" }> = {
  margem_percent: { label: "Margem Mínima (%)", description: "Percentual de margem aplicado sobre o preço de custo para calcular o preço mínimo de venda", type: "number" },
  scraper_hora: { label: "Hora de Execução (0–23)", description: "Hora do dia em que o scraper executa automaticamente (formato 24h)", type: "number" },
  scraper_ativo: { label: "Scraper Automático Ativo", description: "Ativa ou desativa a execução automática diária do monitoramento", type: "boolean" },
  ml_keywords_min_match: { label: "Mínimo de Keywords para Validar", description: "Número mínimo de keywords do produto que devem aparecer no título do anúncio para ser considerado válido", type: "number" },
  ml_search_limit: { label: "Limite de Resultados por Busca", description: "Quantidade máxima de anúncios retornados por busca no Mercado Livre", type: "number" },
  alert_email_ativo: { label: "Alertas por Email Ativos", description: "Ativa ou desativa o envio de notificações quando violações são detectadas", type: "boolean" },
};

export default function Settings() {
  const { data: settings, refetch } = trpc.settings.getAll.useQuery();
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const initSettings = trpc.settings.init.useMutation({
    onSuccess: () => { toast.success("Configurações padrão inicializadas!"); refetch(); },
  });

  const updateSetting = trpc.settings.update.useMutation({
    onSuccess: () => { toast.success("Configuração salva!"); refetch(); setDirty(false); },
    onError: () => toast.error("Erro ao salvar."),
  });

  useEffect(() => {
    if (settings) {
      const map: Record<string, string> = {};
      settings.forEach((s) => { map[s.key] = s.value; });
      setValues(map);
    }
  }, [settings]);

  const handleChange = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
  };

  const handleSaveAll = async () => {
    for (const [key, value] of Object.entries(values)) {
      await updateSetting.mutateAsync({ key, value });
    }
  };

  const settingKeys = Object.keys(SETTING_LABELS);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-muted-foreground" />
            Configurações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Ajuste os parâmetros do sistema de monitoramento</p>
        </div>
        <div className="flex gap-2">
          {!settings?.length && (
            <Button variant="outline" size="sm" onClick={() => initSettings.mutate()}>
              Inicializar Padrões
            </Button>
          )}
          <Button onClick={handleSaveAll} disabled={!dirty || updateSetting.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            Salvar Tudo
          </Button>
        </div>
      </div>

      {/* Settings Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pricing Settings */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Configurações de Preço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {["margem_percent"].map((key) => {
              const meta = SETTING_LABELS[key];
              if (!meta) return null;
              return (
                <div key={key} className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{meta.label}</label>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={values[key] ?? "60"}
                      onChange={(e) => handleChange(key, e.target.value)}
                      className="bg-background border-border w-32"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  {values[key] && (
                    <p className="text-xs text-green-400">
                      Exemplo: Custo R$ 100 → Mínimo R$ {(100 * (1 + parseFloat(values[key]) / 100)).toFixed(2)}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Scraper Settings */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Configurações do Scraper</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {["scraper_hora", "scraper_ativo"].map((key) => {
              const meta = SETTING_LABELS[key];
              if (!meta) return null;
              return (
                <div key={key} className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{meta.label}</label>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                  {meta.type === "boolean" ? (
                    <Switch
                      checked={values[key] === "true"}
                      onCheckedChange={(v) => handleChange(key, v ? "true" : "false")}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={values[key] ?? "14"}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="bg-background border-border w-24"
                      />
                      <span className="text-xs text-muted-foreground">h (horário de Brasília)</span>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ML Validation Settings */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Validação de Produtos (ML)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {["ml_keywords_min_match", "ml_search_limit"].map((key) => {
              const meta = SETTING_LABELS[key];
              if (!meta) return null;
              return (
                <div key={key} className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{meta.label}</label>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                  <Input
                    type="number"
                    value={values[key] ?? ""}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="bg-background border-border w-32"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Notificações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {["alert_email_ativo"].map((key) => {
              const meta = SETTING_LABELS[key];
              if (!meta) return null;
              return (
                <div key={key} className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{meta.label}</label>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                  <Switch
                    checked={values[key] === "true"}
                    onCheckedChange={(v) => handleChange(key, v ? "true" : "false")}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Raw Settings Table */}
      {settings && settings.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Todas as Configurações</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Chave</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Valor</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Descrição</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.map((s) => (
                    <tr key={s.key} className="border-b border-border/50 hover:bg-accent/20">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-primary">{s.key}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-semibold text-foreground">{s.value}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-muted-foreground">{s.description ?? "—"}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-muted-foreground">{new Date(s.updatedAt).toLocaleString("pt-BR")}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
