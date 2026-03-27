/**
 * BrowserCheck — Verificação de Preços via Browser
 *
 * Arquitetura: O servidor Manus tem o IP bloqueado pelo ML PolicyAgent.
 * Esta página executa as chamadas à API do ML DIRETAMENTE do browser do usuário
 * (que não está bloqueado), e envia os resultados ao servidor para processar e salvar.
 *
 * Estratégia de busca (v2):
 * - Busca por palavras-chave dos produtos ASX (ex: "ultra led asx", "super led asx")
 * - Filtra resultados pelo seller_id do cliente
 * - Fallback: busca direta por seller_id na API pública
 * - Fallback 2: busca por loja_ml (nickname)
 */
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Play, RefreshCw, ShoppingBag, Loader2, XCircle } from "lucide-react";

interface ClienteResult {
  clienteId: number;
  clienteNome: string;
  sellerId: string;
  status: "pending" | "running" | "done" | "error";
  totalFound: number;
  totalViolations: number;
  error?: string;
}

interface MLItem {
  mlbId: string;
  title: string;
  price: number;
  url: string;
  thumbnail: string;
}

// Palavras-chave para buscar produtos ASX no ML
const ASX_SEARCH_QUERIES = [
  "ultra led asx",
  "super led asx",
  "worklight asx",
  "xenon asx",
  "led asx lampada",
  "asx 70w led",
  "asx 80w led",
  "asx 40w led",
];

async function fetchSellerItemsFromBrowser(
  sellerId: string,
  lojaML: string | null,
  siteId: string,
  onProgress: (msg: string) => void
): Promise<MLItem[]> {
  const items: MLItem[] = [];
  const seenIds = new Set<string>();

  // Normaliza sellerId: pode ser numérico ou nickname
  const isNumericSeller = /^\d+$/.test(sellerId);

  // ── Estratégia 1: Busca por seller_id numérico na API pública ──
  if (isNumericSeller) {
    try {
      onProgress(`Buscando anúncios do vendedor ${sellerId} via API pública...`);
      const url = `https://api.mercadolibre.com/sites/${siteId}/search?seller_id=${sellerId}&limit=50`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as { results: Array<{ id: string; title: string; price: number; permalink: string; thumbnail: string; seller?: { id: number } }> };
        for (const r of (data.results ?? [])) {
          if (r.id && !seenIds.has(r.id)) {
            seenIds.add(r.id);
            items.push({ mlbId: r.id, title: r.title ?? "", price: r.price ?? 0, url: r.permalink ?? "", thumbnail: r.thumbnail ?? "" });
          }
        }
        onProgress(`${items.length} anúncios encontrados via seller_id.`);
      }
    } catch {
      onProgress(`Busca por seller_id falhou, tentando por keyword...`);
    }
  }

  // ── Estratégia 2: Busca por nickname/loja_ml ──
  if (items.length === 0 && lojaML) {
    try {
      onProgress(`Buscando via nickname "${lojaML}"...`);
      const url = `https://api.mercadolibre.com/sites/${siteId}/search?nickname=${encodeURIComponent(lojaML)}&limit=50`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as { results: Array<{ id: string; title: string; price: number; permalink: string; thumbnail: string; seller?: { id: number; nickname?: string } }> };
        for (const r of (data.results ?? [])) {
          if (r.id && !seenIds.has(r.id)) {
            seenIds.add(r.id);
            items.push({ mlbId: r.id, title: r.title ?? "", price: r.price ?? 0, url: r.permalink ?? "", thumbnail: r.thumbnail ?? "" });
          }
        }
        onProgress(`${items.length} anúncios encontrados via nickname.`);
      }
    } catch {
      onProgress(`Busca por nickname falhou.`);
    }
  }

  // ── Estratégia 3: Busca por palavras-chave ASX, filtrando pelo seller_id ──
  if (items.length === 0) {
    onProgress(`Buscando por palavras-chave ASX e filtrando por vendedor...`);
    for (const query of ASX_SEARCH_QUERIES) {
      try {
        const url = `https://api.mercadolibre.com/sites/${siteId}/search?q=${encodeURIComponent(query)}&limit=50`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json() as {
          results: Array<{
            id: string; title: string; price: number; permalink: string; thumbnail: string;
            seller: { id: number; nickname?: string };
          }>
        };
        let added = 0;
        for (const r of (data.results ?? [])) {
          // Filtra pelo seller_id do cliente
          const matchesSeller = isNumericSeller
            ? String(r.seller?.id) === sellerId
            : (r.seller?.nickname?.toLowerCase() === lojaML?.toLowerCase());
          if (matchesSeller && r.id && !seenIds.has(r.id)) {
            seenIds.add(r.id);
            items.push({ mlbId: r.id, title: r.title ?? "", price: r.price ?? 0, url: r.permalink ?? "", thumbnail: r.thumbnail ?? "" });
            added++;
          }
        }
        if (added > 0) onProgress(`  +${added} itens via "${query}" (total: ${items.length})`);
        // Pequena pausa para não sobrecarregar
        await new Promise(r => setTimeout(r, 300));
      } catch {
        // Ignora erros individuais de query
      }
    }
    if (items.length > 0) onProgress(`${items.length} anúncios encontrados via busca por keyword.`);
  }

  // ── Estratégia 4: Busca ampla por "ASX" sem filtro de seller (último recurso) ──
  if (items.length === 0) {
    onProgress(`Tentando busca ampla por "ASX"...`);
    try {
      const url = `https://api.mercadolibre.com/sites/${siteId}/search?q=${encodeURIComponent("lampada led asx")}&limit=50`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as {
          results: Array<{
            id: string; title: string; price: number; permalink: string; thumbnail: string;
            seller: { id: number; nickname?: string };
          }>
        };
        for (const r of (data.results ?? [])) {
          const matchesSeller = isNumericSeller
            ? String(r.seller?.id) === sellerId
            : (r.seller?.nickname?.toLowerCase() === lojaML?.toLowerCase());
          if (matchesSeller && r.id && !seenIds.has(r.id)) {
            seenIds.add(r.id);
            items.push({ mlbId: r.id, title: r.title ?? "", price: r.price ?? 0, url: r.permalink ?? "", thumbnail: r.thumbnail ?? "" });
          }
        }
      }
    } catch { /* ignora */ }
  }

  return items;
}

export default function BrowserCheck() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<ClienteResult[]>([]);
  const [currentLog, setCurrentLog] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  const { data: tokenData, isLoading: tokenLoading, error: tokenError } = trpc.ml.getAccessToken.useQuery();
  const { data: clientesData, isLoading: clientesLoading } = trpc.ml.getClientesForBrowserCheck.useQuery();
  const submitMutation = trpc.ml.submitBrowserResults.useMutation();

  const addLog = useCallback((msg: string) => {
    setCurrentLog(prev => [...prev.slice(-49), `${new Date().toLocaleTimeString("pt-BR")} — ${msg}`]);
  }, []);

  const runCheck = useCallback(async () => {
    if (!tokenData || !clientesData || clientesData.length === 0) {
      toast.error("Token ML ou lista de clientes não disponível.");
      return;
    }

    setIsRunning(true);
    setCurrentLog([]);
    setProgress(0);

    const initialResults: ClienteResult[] = clientesData.map((c: { id: number; nome: string; sellerId: string; lojaML: string | null }) => ({
      clienteId: c.id,
      clienteNome: c.nome,
      sellerId: c.sellerId,
      status: "pending" as const,
      totalFound: 0,
      totalViolations: 0,
    }));
    setResults(initialResults);

    let completed = 0;
    const total = clientesData.length;
    let totalViolationsAll = 0;

    for (const cliente of clientesData) {
      setResults(prev => prev.map(r =>
        r.clienteId === cliente.id ? { ...r, status: "running" as const } : r
      ));
      addLog(`▶ Iniciando verificação: ${cliente.nome} (seller: ${cliente.sellerId})`);

      try {
        const items = await fetchSellerItemsFromBrowser(
          cliente.sellerId,
          cliente.lojaML,
          tokenData.siteId,
          (msg) => addLog(`  ${msg}`)
        );

        addLog(`  Enviando ${items.length} itens para o servidor processar...`);

        const result = await submitMutation.mutateAsync({
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          sellerId: cliente.sellerId,
          items,
        });

        totalViolationsAll += result.totalViolations;
        setResults(prev => prev.map(r =>
          r.clienteId === cliente.id
            ? { ...r, status: "done" as const, totalFound: result.totalFound, totalViolations: result.totalViolations }
            : r
        ));
        addLog(`  ✅ ${result.totalFound} produtos correspondidos, ${result.totalViolations} violações detectadas.`);

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setResults(prev => prev.map(r =>
          r.clienteId === cliente.id ? { ...r, status: "error" as const, error: msg } : r
        ));
        addLog(`  ❌ Erro: ${msg}`);
      }

      completed++;
      setProgress(Math.round((completed / total) * 100));
    }

    setIsRunning(false);
    toast.success(`Verificação concluída! ${totalViolationsAll} violações detectadas.`);
    addLog(`✅ Verificação completa finalizada. Total de violações: ${totalViolationsAll}`);
  }, [tokenData, clientesData, submitMutation, addLog]);

  const isLoading = tokenLoading || clientesLoading;
  const hasToken = !!tokenData;
  const hasClientes = (clientesData?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Verificação via Browser</h1>
        <p className="text-muted-foreground mt-1">
          Executa buscas diretamente do seu browser, contornando restrições de IP do servidor.
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={hasToken ? "border-green-500/50" : "border-yellow-500/50"}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              {tokenLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : hasToken ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-yellow-500" />
              )}
              <div>
                <p className="text-sm font-medium">Token ML</p>
                <p className="text-xs text-muted-foreground">
                  {tokenLoading ? "Carregando..." : hasToken ? "Conectado" : tokenError ? "Erro: configure em /ml" : "Não configurado"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={hasClientes ? "border-green-500/50" : "border-yellow-500/50"}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              {clientesLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : hasClientes ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-yellow-500" />
              )}
              <div>
                <p className="text-sm font-medium">Revendedores</p>
                <p className="text-xs text-muted-foreground">
                  {clientesLoading ? "Carregando..." : `${clientesData?.length ?? 0} ativos`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <ShoppingBag className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Estratégia</p>
                <p className="text-xs text-muted-foreground">Keyword + Seller Filter</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Action */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Verificação Completa
          </CardTitle>
          <CardDescription>
            Busca anúncios ASX por palavras-chave e filtra por revendedor. Detecta violações de preço mínimo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isRunning && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progresso</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={runCheck}
              disabled={isRunning || isLoading || !hasToken || !hasClientes}
              className="flex items-center gap-2"
            >
              {isRunning ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Verificando...</>
              ) : (
                <><Play className="h-4 w-4" /> Executar Verificação Completa</>
              )}
            </Button>
            {!isRunning && results.length > 0 && (
              <Button variant="outline" onClick={() => { setResults([]); setCurrentLog([]); setProgress(0); }} className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" /> Limpar
              </Button>
            )}
          </div>

          {/* Log */}
          {currentLog.length > 0 && (
            <div className="bg-muted/30 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1">
              {currentLog.map((log, i) => (
                <div key={i} className={
                  log.includes("❌") ? "text-red-400" :
                  log.includes("✅") ? "text-green-400" :
                  log.includes("violaç") ? "text-yellow-400" :
                  "text-muted-foreground"
                }>
                  {log}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resultados por Revendedor</CardTitle>
            <CardDescription>
              {results.filter(r => r.status === "done").length}/{results.length} verificados
              {" · "}
              {results.reduce((s, r) => s + r.totalViolations, 0)} violações detectadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.map(r => (
                <div key={r.clienteId} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                  <div className="flex items-center gap-3">
                    {r.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                    {r.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                    {r.status === "done" && (r.totalViolations > 0
                      ? <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      : <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {r.status === "error" && <XCircle className="h-4 w-4 text-red-500" />}
                    <div>
                      <p className="text-sm font-medium">{r.clienteNome}</p>
                      {r.status === "error" && <p className="text-xs text-red-400">{r.error}</p>}
                      {r.status === "done" && (
                        <p className="text-xs text-muted-foreground">
                          {r.totalFound} produtos · {r.totalViolations} violações
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.status === "done" && r.totalViolations > 0 && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {r.totalViolations} violações
                      </Badge>
                    )}
                    {r.status === "done" && r.totalViolations === 0 && r.totalFound > 0 && (
                      <Badge variant="outline" className="text-green-500 border-green-500/50">OK</Badge>
                    )}
                    {r.status === "done" && r.totalFound === 0 && (
                      <Badge variant="outline" className="text-muted-foreground">Sem anúncios ASX</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <ShoppingBag className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Como funciona a verificação</p>
              <p>O sistema busca anúncios ASX por palavras-chave ({ASX_SEARCH_QUERIES.slice(0, 3).join(", ")}...) e filtra pelo ID do revendedor. Itens encontrados são comparados com o preço mínimo do catálogo para detectar violações.</p>
              <p>Se um revendedor aparecer como "Sem anúncios ASX", pode ser que ele não venda produtos ASX ou use um seller_id diferente do cadastrado.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
