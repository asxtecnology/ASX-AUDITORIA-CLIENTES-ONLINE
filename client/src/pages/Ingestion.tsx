import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, CheckCircle, AlertTriangle, Clock, Download, Zap, Globe, Chrome } from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
      {copied ? <CheckCircle className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function CodeBlock({ code, language = "json" }: { code: string; language?: string }) {
  return (
    <div className="relative rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 border-b border-zinc-700">
        <span className="text-xs text-zinc-400 font-mono">{language}</span>
        <CopyButton text={code} />
      </div>
      <pre className="p-4 text-xs text-zinc-200 font-mono overflow-x-auto whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    completed: { label: "Concluído", className: "bg-green-500/20 text-green-400 border-green-500/30" },
    processing: { label: "Processando", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    failed: { label: "Falhou", className: "bg-red-500/20 text-red-400 border-red-500/30" },
    pending: { label: "Pendente", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  };
  const cfg = map[status] || { label: status, className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" };
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>;
}

export default function Ingestion() {
  const { data: apiKeyData } = trpc.ingestion.getApiKey.useQuery();
  const { data: stats } = trpc.ingestion.getStats.useQuery();
  const { data: runs, isLoading } = trpc.ingestion.getRuns.useQuery({ limit: 20 });

  const baseUrl = window.location.origin;
  const apiKey = apiKeyData?.apiKey || "asx-ingest-2026";
  const endpoint = `${baseUrl}/api/ingest/ml-listings`;

  const examplePayload = JSON.stringify({
    source: "browser_extension",
    sourceVersion: "1.0.0",
    clienteId: 1,
    sellerNickname: "ls-distribuidora",
    sellerId: "241146691",
    apiKey,
    listings: [
      {
        mlItemId: "MLB3811532946",
        mlTitle: "Par Ultra Led Asx 70w 10000 Lúmens 6000k 12/24v Automotiva",
        mlUrl: "https://produto.mercadolivre.com.br/MLB-3811532946",
        price: 169.00,
        originalPrice: 189.20,
        currency: "BRL",
        sellerId: "241146691",
        sellerNickname: "ls-distribuidora",
        screenshotUrl: "https://exemplo.com/screenshot.png"
      }
    ]
  }, null, 2);

  const curlExample = `curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey}" \\
  -d '${JSON.stringify({ source: "collector_agent", clienteId: 1, sellerNickname: "ls-distribuidora", listings: [{ mlItemId: "MLB3811532946", mlTitle: "Par Ultra Led Asx 70w 10000 Lúmens 6000k", mlUrl: "https://produto.mercadolivre.com.br/MLB-3811532946", price: 169.00, currency: "BRL" }] })}'`;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Zap className="h-6 w-6 text-yellow-400" />
          Sistema de Ingestão
        </h1>
        <p className="text-zinc-400 mt-1">
          Receba anúncios coletados por agentes externos (extensão Chrome, scripts, fornecedores de dados).
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-white">{stats?.totalRuns ?? 0}</div>
            <div className="text-xs text-zinc-400 mt-1">Ingestões realizadas</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-400">{stats?.totalProcessed ?? 0}</div>
            <div className="text-xs text-zinc-400 mt-1">Anúncios processados</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-700">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-400">{stats?.totalViolations ?? 0}</div>
            <div className="text-xs text-zinc-400 mt-1">Violações detectadas</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-700">
          <CardContent className="p-4">
            <div className="text-sm font-bold text-zinc-300">
              {stats?.lastRun ? new Date(stats.lastRun).toLocaleDateString("pt-BR") : "—"}
            </div>
            <div className="text-xs text-zinc-400 mt-1">Última ingestão</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="extension" className="space-y-4">
        <TabsList className="bg-zinc-800 border border-zinc-700">
          <TabsTrigger value="extension" className="data-[state=active]:bg-zinc-700">
            <Chrome className="h-4 w-4 mr-2" />
            Extensão Chrome
          </TabsTrigger>
          <TabsTrigger value="api" className="data-[state=active]:bg-zinc-700">
            <Globe className="h-4 w-4 mr-2" />
            API REST
          </TabsTrigger>
          <TabsTrigger value="runs" className="data-[state=active]:bg-zinc-700">
            <Clock className="h-4 w-4 mr-2" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* Extensão Chrome Tab */}
        <TabsContent value="extension" className="space-y-4">
          <Alert className="bg-yellow-500/10 border-yellow-500/30">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <AlertDescription className="text-yellow-200">
              <strong>Por que usar a extensão?</strong> A API do Mercado Livre bloqueia chamadas de servidores cloud (IP de datacenter). A extensão Chrome coleta os anúncios diretamente do seu browser, onde não há bloqueio.
            </AlertDescription>
          </Alert>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-zinc-900 border-zinc-700">
              <CardHeader>
                <CardTitle className="text-white text-base">1. Instalar a Extensão</CardTitle>
                <CardDescription className="text-zinc-400">
                  Baixe o arquivo ZIP e instale no Chrome em modo desenvolvedor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="bg-zinc-700 text-zinc-300 rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">1</span>
                  <span>Baixe o arquivo <code className="bg-zinc-800 px-1 rounded text-yellow-300">asx-collector-extension.zip</code> abaixo</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="bg-zinc-700 text-zinc-300 rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">2</span>
                  <span>Abra o Chrome e acesse <code className="bg-zinc-800 px-1 rounded text-yellow-300">chrome://extensions</code></span>
                </div>
                <div className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="bg-zinc-700 text-zinc-300 rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">3</span>
                  <span>Ative o <strong>Modo desenvolvedor</strong> (canto superior direito)</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-zinc-300">
                  <span className="bg-zinc-700 text-zinc-300 rounded-full w-5 h-5 flex items-center justify-center text-xs shrink-0 mt-0.5">4</span>
                  <span>Clique em <strong>Carregar sem compactação</strong> e selecione a pasta extraída do ZIP</span>
                </div>
                <a
                  href="/api/ingest/status"
                  target="_blank"
                  className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    // Trigger download of the extension zip
                    const link = document.createElement("a");
                    link.href = "data:text/plain,Download the extension from the server";
                    link.download = "asx-collector-extension.zip";
                    alert("Para baixar a extensão, acesse o painel de Código do projeto e faça download do arquivo asx-collector-extension.zip");
                  }}
                >
                  <Download className="h-4 w-4" />
                  Baixar Extensão (.zip)
                </a>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-700">
              <CardHeader>
                <CardTitle className="text-white text-base">2. Configurar a Extensão</CardTitle>
                <CardDescription className="text-zinc-400">
                  Configure a URL do servidor e a API Key na extensão.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-xs text-zinc-400 mb-1">URL do Servidor</div>
                  <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
                    <code className="text-xs text-green-300 flex-1 break-all">{baseUrl}</code>
                    <CopyButton text={baseUrl} />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-400 mb-1">API Key</div>
                  <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
                    <code className="text-xs text-yellow-300 flex-1">{apiKey}</code>
                    <CopyButton text={apiKey} />
                  </div>
                </div>
                <div className="text-xs text-zinc-500 mt-2">
                  Cole esses valores nas configurações da extensão (ícone ASX → Configurações).
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-zinc-900 border-zinc-700">
            <CardHeader>
              <CardTitle className="text-white text-base">3. Usar a Extensão</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div className="bg-zinc-800 rounded-lg p-3 space-y-1">
                  <div className="text-yellow-300 font-medium">Coleta Manual</div>
                  <div className="text-zinc-400">Abra a página de um revendedor no ML, clique no ícone ASX e pressione "Coletar Anúncios".</div>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3 space-y-1">
                  <div className="text-blue-300 font-medium">Coleta Automática</div>
                  <div className="text-zinc-400">A extensão detecta automaticamente páginas de loja ML e coleta os anúncios em segundo plano.</div>
                </div>
                <div className="bg-zinc-800 rounded-lg p-3 space-y-1">
                  <div className="text-green-300 font-medium">Envio ao Servidor</div>
                  <div className="text-zinc-400">Os anúncios são enviados para o endpoint de ingestão e processados automaticamente.</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API REST Tab */}
        <TabsContent value="api" className="space-y-4">
          <Card className="bg-zinc-900 border-zinc-700">
            <CardHeader>
              <CardTitle className="text-white text-base">Endpoint de Ingestão</CardTitle>
              <CardDescription className="text-zinc-400">
                Envie lotes de anúncios via POST. Máximo 500 por requisição.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-xs text-zinc-400 mb-1">Endpoint</div>
                <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
                  <code className="text-xs text-green-300 flex-1 break-all">POST {endpoint}</code>
                  <CopyButton text={endpoint} />
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Autenticação</div>
                <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
                  <code className="text-xs text-yellow-300 flex-1">x-api-key: {apiKey}</code>
                  <CopyButton text={apiKey} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-700">
            <CardHeader>
              <CardTitle className="text-white text-base">Exemplo de Payload</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={examplePayload} language="json" />
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-700">
            <CardHeader>
              <CardTitle className="text-white text-base">Exemplo cURL</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock code={curlExample} language="bash" />
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-700">
            <CardHeader>
              <CardTitle className="text-white text-base">Campos do Listing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      <th className="text-left text-zinc-400 py-2 pr-4">Campo</th>
                      <th className="text-left text-zinc-400 py-2 pr-4">Tipo</th>
                      <th className="text-left text-zinc-400 py-2 pr-4">Obrigatório</th>
                      <th className="text-left text-zinc-400 py-2">Descrição</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    {[
                      ["mlItemId", "string", "Sim", "ID do anúncio no ML (ex: MLB3811532946)"],
                      ["mlTitle", "string", "Sim", "Título completo do anúncio"],
                      ["mlUrl", "string", "Sim", "URL completa do anúncio"],
                      ["price", "number", "Sim", "Preço atual em BRL"],
                      ["originalPrice", "number", "Não", "Preço original (riscado)"],
                      ["sellerId", "string", "Não", "ID numérico do vendedor"],
                      ["sellerNickname", "string", "Não", "Nickname do vendedor no ML"],
                      ["mlThumbnail", "string", "Não", "URL da imagem do anúncio"],
                      ["screenshotUrl", "string", "Recomendado", "URL do screenshot como evidência"],
                    ].map(([field, type, req, desc]) => (
                      <tr key={field} className="border-b border-zinc-800">
                        <td className="py-2 pr-4"><code className="text-yellow-300 text-xs">{field}</code></td>
                        <td className="py-2 pr-4 text-xs text-blue-300">{type}</td>
                        <td className="py-2 pr-4 text-xs">{req === "Sim" ? <span className="text-red-400">{req}</span> : <span className="text-zinc-500">{req}</span>}</td>
                        <td className="py-2 text-xs text-zinc-400">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Histórico Tab */}
        <TabsContent value="runs" className="space-y-4">
          <Card className="bg-zinc-900 border-zinc-700">
            <CardHeader>
              <CardTitle className="text-white text-base">Ingestões Recentes</CardTitle>
              <CardDescription className="text-zinc-400">
                Últimas 20 ingestões recebidas pelo sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-zinc-400 text-sm py-8 text-center">Carregando...</div>
              ) : !runs || runs.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <Zap className="h-10 w-10 text-zinc-600 mx-auto" />
                  <div className="text-zinc-400 text-sm">Nenhuma ingestão realizada ainda.</div>
                  <div className="text-zinc-500 text-xs">Instale a extensão Chrome ou envie dados via API para começar.</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700">
                        <th className="text-left text-zinc-400 py-2 pr-3">ID</th>
                        <th className="text-left text-zinc-400 py-2 pr-3">Fonte</th>
                        <th className="text-left text-zinc-400 py-2 pr-3">Vendedor</th>
                        <th className="text-left text-zinc-400 py-2 pr-3">Anúncios</th>
                        <th className="text-left text-zinc-400 py-2 pr-3">Processados</th>
                        <th className="text-left text-zinc-400 py-2 pr-3">Violações</th>
                        <th className="text-left text-zinc-400 py-2 pr-3">Status</th>
                        <th className="text-left text-zinc-400 py-2">Data</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-300">
                      {(runs as any[]).map((run) => (
                        <tr key={run.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                          <td className="py-2 pr-3 text-zinc-500 text-xs">#{run.id}</td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-300">
                              {run.source}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 text-xs text-zinc-400">{run.sellerNickname || "—"}</td>
                          <td className="py-2 pr-3 text-xs">{run.totalListings ?? 0}</td>
                          <td className="py-2 pr-3 text-xs text-blue-400">{run.processedListings ?? 0}</td>
                          <td className="py-2 pr-3 text-xs">
                            {(run.violationsFound ?? 0) > 0 ? (
                              <span className="text-red-400 font-semibold">{run.violationsFound}</span>
                            ) : (
                              <span className="text-zinc-500">0</span>
                            )}
                          </td>
                          <td className="py-2 pr-3"><StatusBadge status={run.status} /></td>
                          <td className="py-2 text-xs text-zinc-500">
                            {new Date(run.startedAt).toLocaleString("pt-BR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
