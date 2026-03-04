import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Settings as SettingsIcon, Save, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const SETTING_LABELS: Record<string, { label: string; description: string; type: "number" | "boolean" | "text"; unit?: string; min?: number; max?: number }> = {
  margem_percent:        { label: "Margem Mínima (%)", description: "Percentual aplicado sobre o custo para calcular o preço mínimo de venda", type: "number", unit: "%", min: 1, max: 500 },
  scraper_hora:          { label: "Hora de Execução (0–23)", description: "Hora do dia em que o scraper executa automaticamente (formato 24h)", type: "number", unit: "h", min: 0, max: 23 },
  scraper_ativo:         { label: "Scraper Automático Ativo", description: "Ativa ou desativa a execução automática diária do monitoramento", type: "boolean" },
  ml_keywords_min_match: { label: "Mínimo de Keywords para Validar", description: "Número mínimo de keywords do produto que devem aparecer no título do anúncio", type: "number", min: 1, max: 10 },
  ml_search_limit:       { label: "Limite de Resultados por Busca", description: "Quantidade máxima de anúncios retornados por busca no Mercado Livre", type: "number", min: 10, max: 200 },
  alert_email_ativo:     { label: "Alertas por Email Ativos", description: "Ativa ou desativa o envio de notificações quando violações são detectadas", type: "boolean" },
};

const DEFAULTS: Record<string, string> = {
  margem_percent: "60",
  scraper_hora: "14",
  scraper_ativo: "true",
  ml_keywords_min_match: "2",
  ml_search_limit: "50",
  alert_email_ativo: "true",
};

export default function Settings() {
  const { data: settings, refetch, isLoading } = trpc.settings.getAll.useQuery();
  const [values, setValues] = useState<Record<string, string>>(DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const initSettings = trpc.settings.init.useMutation({
    onSuccess: () => { toast.success("Configurações padrão inicializadas!"); refetch(); },
  });

  const updateSetting = trpc.settings.update.useMutation({
    onError: (e) => toast.error("Erro ao salvar: " + e.message),
  });

  // Populate values when settings load
  useEffect(() => {
    if (settings && settings.length > 0) {
      const map: Record<string, string> = { ...DEFAULTS };
      settings.forEach((s) => { map[s.key] = s.value; });
      setValues(map);
      setDirty(false);
    }
  }, [settings]);

  const handleChange = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(values)) {
        if (SETTING_LABELS[key]) {
          await updateSetting.mutateAsync({ key, value });
        }
      }
      toast.success("Configurações salvas! Preços recalculados.");
      refetch();
      setDirty(false);
    } catch {
      // error handled in mutation
    } finally {
      setSaving(false);
    }
  };

  const margemValue = parseFloat(values["margem_percent"] || "60");
  const exemploMinimo = isNaN(margemValue) ? "—" : (100 * (1 + margemValue / 100)).toFixed(2);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-muted-foreground" />
            Configurações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Ajuste os parâmetros do sistema de monitoramento</p>
        </div>
        <div className="flex gap-2">
          {(!settings || settings.length === 0) && !isLoading && (
            <Button variant="outline" size="sm" onClick={() => initSettings.mutate()}>
              Inicializar Padrões
            </Button>
          )}
          <Button onClick={handleSaveAll} disabled={!dirty || saving} className="gap-2">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Tudo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Configurações de Preço ─────────────────────── */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Configurações de Preço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {SETTING_LABELS["margem_percent"].label}
              </label>
              <p className="text-xs text-muted-foreground">
                {SETTING_LABELS["margem_percent"].description}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={values["margem_percent"]}
                  onChange={(e) => handleChange("margem_percent", e.target.value)}
                  className="bg-background border-border w-32"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-green-400">
                Exemplo: Custo R$ 100,00 → Mínimo R$ {exemploMinimo}
              </p>
              <p className="text-xs text-yellow-400/80">
                ⚠️ Ao salvar, o preço mínimo de todos os {531} produtos será recalculado automaticamente.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Configurações do Scraper ───────────────────── */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Configurações do Scraper</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Hora */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {SETTING_LABELS["scraper_hora"].label}
              </label>
              <p className="text-xs text-muted-foreground">
                {SETTING_LABELS["scraper_hora"].description}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={values["scraper_hora"]}
                  onChange={(e) => handleChange("scraper_hora", e.target.value)}
                  className="bg-background border-border w-24"
                />
                <span className="text-xs text-muted-foreground">h (horário de Brasília)</span>
              </div>
            </div>
            {/* Ativo */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {SETTING_LABELS["scraper_ativo"].label}
              </label>
              <p className="text-xs text-muted-foreground">
                {SETTING_LABELS["scraper_ativo"].description}
              </p>
              <Switch
                checked={values["scraper_ativo"] === "true"}
                onCheckedChange={(v) => handleChange("scraper_ativo", v ? "true" : "false")}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Validação ML ───────────────────────────────── */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Validação de Produtos (ML)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(["ml_keywords_min_match", "ml_search_limit"] as const).map((key) => {
              const meta = SETTING_LABELS[key];
              return (
                <div key={key} className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{meta.label}</label>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                  <Input
                    type="number"
                    min={meta.min}
                    max={meta.max}
                    value={values[key]}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="bg-background border-border w-32"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ── Notificações ────────────────────────────────── */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Notificações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {SETTING_LABELS["alert_email_ativo"].label}
              </label>
              <p className="text-xs text-muted-foreground">
                {SETTING_LABELS["alert_email_ativo"].description}
              </p>
              <Switch
                checked={values["alert_email_ativo"] === "true"}
                onCheckedChange={(v) => handleChange("alert_email_ativo", v ? "true" : "false")}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabela de todas as configs ─────────────────────── */}
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
                        <span className="text-xs text-muted-foreground">
                          {new Date(s.updatedAt).toLocaleString("pt-BR")}
                        </span>
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
