import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Trash2,
  ShoppingBag,
  Key,
  User,
  Globe,
  Info,
  Wifi,
  WifiOff,
  Copy,
  ArrowRight,
} from "lucide-react";

const SITE_OPTIONS = [
  { value: "MLB", label: "Brasil (MLB)" },
  { value: "MLA", label: "Argentina (MLA)" },
  { value: "MLM", label: "México (MLM)" },
  { value: "MLE", label: "Espanha (MLE)" },
  { value: "MLC", label: "Chile (MLC)" },
  { value: "MCO", label: "Colômbia (MCO)" },
  { value: "MPE", label: "Peru (MPE)" },
  { value: "MLU", label: "Uruguai (MLU)" },
];

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === "pending") {
    return (
      <Badge variant="outline" className="gap-1 text-yellow-400 border-yellow-400/40">
        <Clock className="h-3 w-3" />
        Aguardando autorização
      </Badge>
    );
  }
  if (status === "authorized") {
    return (
      <Badge variant="outline" className="gap-1 text-green-400 border-green-400/40">
        <CheckCircle2 className="h-3 w-3" />
        Autorizado
      </Badge>
    );
  }
  if (status === "expired") {
    return (
      <Badge variant="outline" className="gap-1 text-orange-400 border-orange-400/40">
        <Clock className="h-3 w-3" />
        Token expirado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-red-400 border-red-400/40">
      <XCircle className="h-3 w-3" />
      Erro
    </Badge>
  );
}

export default function MercadoLivre() {
  const [appId, setAppId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [siteId, setSiteId] = useState("MLB");
  const [redirectUri, setRedirectUri] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const utils = trpc.useUtils();
  const { data: cred, isLoading } = trpc.ml.getCredentials.useQuery();
  const { data: authUrlData } = trpc.ml.getAuthUrl.useQuery(
    { origin: window.location.origin },
    { enabled: !!cred && cred.status !== "authorized" }
  );

  // Redirect URI que será usado — sempre consistente com o banco
  const effectiveRedirectUri = authUrlData?.redirectUri || `${window.location.origin}/ml`;

  const saveMutation = trpc.ml.saveCredentials.useMutation({
    onSuccess: () => {
      toast.success("Credenciais salvas com sucesso!");
      utils.ml.getCredentials.invalidate();
      utils.ml.getAuthUrl.invalidate();
      setIsEditing(false);
      setClientSecret("");
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err.message}`),
  });

  const refreshMutation = trpc.ml.refreshToken.useMutation({
    onSuccess: (data) => {
      toast.success(`Token renovado! Expira em: ${new Date(data.expiresAt).toLocaleString()}`);
      utils.ml.getCredentials.invalidate();
    },
    onError: (err) => toast.error(`Erro ao renovar token: ${err.message}`),
  });

  const deleteMutation = trpc.ml.deleteCredentials.useMutation({
    onSuccess: () => {
      toast.success("Credenciais removidas.");
      utils.ml.getCredentials.invalidate();
      setIsEditing(true);
      setAppId("");
      setClientSecret("");
    },
    onError: (err) => toast.error(`Erro ao remover: ${err.message}`),
  });

  const testMutation = trpc.ml.testConnection.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ Conexão OK! Conta: ${data.nickname} (${data.email}) — Site: ${data.siteId}`);
      utils.ml.getCredentials.invalidate();
    },
    onError: (err) => toast.error(`❌ Falha na conexão: ${err.message}`),
  });

  // Verificar se voltou do OAuth ML com um code na URL
  const exchangeMutation = trpc.ml.exchangeCode.useMutation({
    onSuccess: (data) => {
      toast.success(`🎉 Conta ML autorizada: ${data.mlNickname} (${data.mlEmail})`);
      utils.ml.getCredentials.invalidate();
      window.history.replaceState({}, "", window.location.pathname);
    },
    onError: (err) => {
      toast.error(`Erro ao autorizar: ${err.message}`);
      window.history.replaceState({}, "", window.location.pathname);
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && !exchangeMutation.isPending) {
      // Usar sempre /ml como redirectUri (consistente com o que foi enviado ao ML)
      const redirectUriUsed = `${window.location.origin}/ml`;
      // Recuperar code_verifier do sessionStorage (PKCE)
      const codeVerifier = sessionStorage.getItem("ml_code_verifier") || undefined;
      sessionStorage.removeItem("ml_code_verifier"); // limpar após uso
      exchangeMutation.mutate({ code, redirectUri: redirectUriUsed, codeVerifier });
    }
  }, []);

  // Preencher formulário com dados existentes ao entrar em modo edição
  useEffect(() => {
    if (isEditing && cred) {
      setAppId(cred.appId || "");
      setSiteId(cred.siteId || "MLB");
      setRedirectUri(cred.redirectUri || "");
    }
  }, [isEditing, cred]);

  const showForm = !cred || isEditing;

  const handleSave = () => {
    if (!appId.trim() || !clientSecret.trim()) {
      toast.error("App ID e Client Secret são obrigatórios.");
      return;
    }
    saveMutation.mutate({
      appId: appId.trim(),
      clientSecret: clientSecret.trim(),
      siteId: siteId as "MLB" | "MLA" | "MLM" | "MLE" | "MLC" | "MCO" | "MPE" | "MLU",
      redirectUri: redirectUri.trim() || undefined,
    });
  };

  const handleAuthorize = () => {
    if (authUrlData?.authUrl) {
      // Salvar code_verifier no sessionStorage antes do redirect (PKCE)
      if (authUrlData.codeVerifier) {
        sessionStorage.setItem("ml_code_verifier", authUrlData.codeVerifier);
      }
      window.location.href = authUrlData.authUrl;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Copiado!"));
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Cabeçalho */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <ShoppingBag className="h-6 w-6 text-yellow-400" />
          <h1 className="text-2xl font-bold">Integração Mercado Livre</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Configure as credenciais do seu App ML para usar a API oficial e monitorar anúncios com mais precisão e sem bloqueios.
        </p>
      </div>

      {/* Alerta de callback OAuth em andamento */}
      {exchangeMutation.isPending && (
        <Alert className="border-blue-500/40 bg-blue-500/10">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
          <AlertTitle>Autorizando conta ML...</AlertTitle>
          <AlertDescription>Aguarde enquanto trocamos o código de autorização pelo token de acesso.</AlertDescription>
        </Alert>
      )}

      {/* Card de status atual */}
      {cred && !isEditing && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="h-4 w-4 text-yellow-400" />
                Credenciais Configuradas
              </CardTitle>
              <StatusBadge status={cred.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">App ID</span>
                <p className="font-mono font-medium mt-0.5">{cred.appId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Client Secret</span>
                <p className="font-mono font-medium mt-0.5">{cred.clientSecretMasked ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Site</span>
                <p className="font-medium mt-0.5">{SITE_OPTIONS.find(s => s.value === cred.siteId)?.label ?? cred.siteId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Última atualização</span>
                <p className="font-medium mt-0.5">{cred.updatedAt ? new Date(cred.updatedAt).toLocaleString() : "—"}</p>
              </div>
            </div>

            {/* Dados da conta ML autorizada */}
            {cred.status === "authorized" && cred.mlNickname && (
              <>
                <Separator />
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <User className="h-8 w-8 text-green-400 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-300">{cred.mlNickname}</p>
                    <p className="text-sm text-muted-foreground">{cred.mlEmail}</p>
                    {cred.expiresAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Token expira em: {new Date(cred.expiresAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Erro */}
            {cred.lastError && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs font-mono">{cred.lastError}</AlertDescription>
              </Alert>
            )}

            {/* Ações */}
            <div className="flex flex-wrap gap-2 pt-1">
              {cred.status !== "authorized" && (
                <Button
                  onClick={handleAuthorize}
                  disabled={!authUrlData?.authUrl}
                  className="gap-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
                >
                  <ExternalLink className="h-4 w-4" />
                  Autorizar no Mercado Livre
                </Button>
              )}
              {cred.status === "authorized" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => testMutation.mutate()}
                    disabled={testMutation.isPending}
                    className="gap-2 text-green-400 border-green-400/30 hover:border-green-400/60"
                  >
                    {testMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wifi className="h-4 w-4" />
                    )}
                    Testar Conexão
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => refreshMutation.mutate()}
                    disabled={refreshMutation.isPending}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
                    Renovar Token
                  </Button>
                </>
              )}
              {cred.status === "expired" && (
                <Button
                  variant="outline"
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending}
                  className="gap-2 text-orange-400 border-orange-400/30 hover:border-orange-400/60"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
                  Renovar Token Expirado
                </Button>
              )}
              <Button variant="outline" onClick={() => setIsEditing(true)} className="gap-2">
                <Key className="h-4 w-4" />
                Editar Credenciais
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm("Tem certeza que deseja remover as credenciais ML?")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
                className="gap-2 text-red-400 hover:text-red-300 border-red-400/30 hover:border-red-400/60"
              >
                <Trash2 className="h-4 w-4" />
                Remover
              </Button>
            </div>

            {/* Aviso de URL de redirect para autorização pendente */}
            {cred.status !== "authorized" && (
              <Alert className="border-yellow-500/30 bg-yellow-500/5 py-3">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-xs text-yellow-200 space-y-2">
                  <p><strong>Antes de autorizar</strong>, confirme que a URL abaixo está cadastrada no seu App ML em{" "}
                    <a href="https://developers.mercadolivre.com.br" target="_blank" rel="noopener noreferrer" className="underline">
                      developers.mercadolivre.com.br
                    </a>:
                  </p>
                  <div className="flex items-center gap-2 bg-black/30 rounded px-2 py-1.5">
                    <code className="flex-1 text-yellow-300 text-xs break-all">{effectiveRedirectUri}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-yellow-400 hover:text-yellow-300"
                      onClick={() => copyToClipboard(effectiveRedirectUri)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Formulário de configuração */}
      {showForm && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4 text-yellow-400" />
              {cred ? "Editar Credenciais" : "Configurar App Mercado Livre"}
            </CardTitle>
            <CardDescription>
              Insira as credenciais do seu App criado em{" "}
              <a
                href="https://developers.mercadolivre.com.br/pt_br/crie-seu-aplicativo"
                target="_blank"
                rel="noopener noreferrer"
                className="text-yellow-400 hover:underline inline-flex items-center gap-1"
              >
                developers.mercadolivre.com.br
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="appId">App ID *</Label>
                <Input
                  id="appId"
                  placeholder="Ex: 3464765781004451"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret *</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  placeholder={cred ? "Deixe em branco para manter o atual" : "Cole o Client Secret aqui"}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="siteId">País / Site</Label>
                <Select value={siteId} onValueChange={setSiteId}>
                  <SelectTrigger id="siteId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SITE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="redirectUri">
                  URL de Redirecionamento
                  <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
                </Label>
                <Input
                  id="redirectUri"
                  placeholder={`${window.location.origin}/ml`}
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                />
              </div>
            </div>

            <Alert className="border-blue-500/40 bg-blue-500/10 py-3">
              <Info className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-xs text-blue-200 space-y-1">
                <p><strong>URL de Redirect obrigatória no painel ML:</strong></p>
                <div className="flex items-center gap-2 bg-black/30 rounded px-2 py-1.5">
                  <code className="flex-1 text-blue-300 text-xs break-all">{window.location.origin}/ml</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-blue-400 hover:text-blue-300"
                    onClick={() => copyToClipboard(`${window.location.origin}/ml`)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>

            <div className="flex gap-2 pt-1">
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending || !appId.trim() || (!clientSecret.trim() && !cred)}
                className="gap-2 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
              >
                {saveMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Key className="h-4 w-4" />
                )}
                {cred ? "Atualizar Credenciais" : "Salvar e Continuar"}
              </Button>
              {isEditing && (
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guia passo a passo */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-400" />
            Como configurar em 3 passos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-5 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-xs font-bold">1</span>
              <div className="space-y-1">
                <p className="font-medium">Adicione a URL de redirect no painel ML Developers</p>
                <p className="text-muted-foreground">
                  Acesse{" "}
                  <a
                    href="https://developers.mercadolivre.com.br"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-yellow-400 hover:underline inline-flex items-center gap-1"
                  >
                    developers.mercadolivre.com.br <ExternalLink className="h-3 w-3" />
                  </a>
                  , abra seu App e adicione esta URL em <strong>"URLs de redirecionamento"</strong>:
                </p>
                <div className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1.5 mt-1">
                  <code className="flex-1 text-yellow-300 text-xs break-all">{window.location.origin}/ml</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => copyToClipboard(`${window.location.origin}/ml`)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p className="font-medium">Cole o App ID e Client Secret acima</p>
                <p className="text-muted-foreground mt-0.5">
                  Copie o <strong>App ID</strong> e o <strong>Client Secret</strong> do painel do seu App ML e cole nos campos do formulário acima. Selecione o país correto (Brasil = MLB).
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p className="font-medium">Clique em "Autorizar no Mercado Livre"</p>
                <p className="text-muted-foreground mt-0.5">
                  Você será redirecionado para o ML para aprovar o acesso. Após aprovar, o sistema recebe o token automaticamente e fica pronto para monitorar anúncios via API oficial (600 req/min).
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <WifiOff className="h-3 w-3 text-yellow-400" />
                  <span>API pública: 60 req/min</span>
                  <ArrowRight className="h-3 w-3" />
                  <Wifi className="h-3 w-3 text-green-400" />
                  <span className="text-green-400 font-medium">API autorizada: 600 req/min</span>
                </div>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
