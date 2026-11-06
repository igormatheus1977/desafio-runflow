// Roda os 6 fluxos de aceite numa única sessão (mesmo histórico), confere cada resposta
// e salva tudo em docs/transcricoes.md. Uso: npm run aceite
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

// Porta própria e API nova: o estoque sempre começa do zero, sem interferir em outra API aberta.
const PORTA = "3100";
process.env.API_PORT = PORTA;
const api = `http://127.0.0.1:${PORTA}`;

type Tool = { nome: string; args: any };
interface Caso {
  fluxo: string;
  frase: string;
  confere: (texto: string, tools: Tool[]) => string[]; // devolve a lista de problemas
}

const usou = (tools: Tool[], nome: string, id?: number) =>
  tools.some((t) => t.nome === nome && (id === undefined || t.args?.id === id));
const exige = (ok: unknown, problema: string) => (ok ? [] : [problema]);
const semTools = (tools: Tool[]) => exige(tools.length === 0, `não deveria usar tool: ${tools.map((t) => t.nome)}`);
const semCriar = (tools: Tool[]) => exige(!usou(tools, "create_order"), "chamou create_order indevidamente");
const itensIguais = (tools: Tool[], esperado: [number, number][]) => {
  const pedido = tools.find((t) => t.nome === "create_order");
  const itens = (pedido?.args?.itens ?? []).map((i: any) => [i.produtoId, i.quantidade]);
  return exige(JSON.stringify(itens) === JSON.stringify(esperado), `create_order com itens errados: ${JSON.stringify(itens)}`);
};

// As frases são exatamente as da transcrição do README.
const casos: Caso[] = [
  { fluxo: "1. Listar produtos", frase: "Quais produtos vocês têm disponíveis?", confere: (t, f) => [
    ...exige(usou(f, "list_products"), "não chamou list_products"),
    ...exige(/iPhone 18[\s\S]*sem estoque/i.test(t), "não avisou que o iPhone 18 está sem estoque"),
  ] },
  { fluxo: "1. Listar produtos", frase: "Me mostra só os que estão em estoque.", confere: (t, f) => [
    ...semTools(f),
    ...exige(["13", "14", "15", "16", "17"].every((n) => t.includes(`iPhone ${n}`)), "faltou produto em estoque"),
    ...exige(!/iPhone 18.*R\$/.test(t), "listou o iPhone 18 como disponível"),
  ] },
  { fluxo: "2. Detalhes do produto", frase: "Me conta mais sobre o produto 3.", confere: (t, f) => [
    ...exige(usou(f, "get_product", 3), "não chamou get_product(3)"),
    ...exige(t.includes("iPhone 15"), "não citou o iPhone 15"),
  ] },
  { fluxo: "2. Detalhes do produto", frase: "E quanto custa o produto 2?", confere: (t, f) => [
    ...exige(usou(f, "get_product", 2), "não chamou get_product(2)"),
    ...exige(t.includes("iPhone 14") && t.includes("5.000"), "não deu nome e preço do iPhone 14"),
  ] },
  { fluxo: "3. Criar pedido", frase: "Quero 2 unidades do produto 1 e 1 unidade do produto 4", confere: (t, f) => [
    ...itensIguais(f, [[1, 2], [4, 1]]),
    ...exige(t.includes("1001") && t.includes("16.000"), "não confirmou pedido 1001 e total R$ 16.000"),
  ] },
  { fluxo: "3. Criar pedido", frase: "Adiciona 3 do último que você me mostrou", confere: (t, f) => [
    ...semTools(f),
    ...exige(t.includes("iPhone 16"), "não identificou o iPhone 16 pelo contexto"),
    ...exige(/novo pedido/i.test(t) && t.includes("?"), "não perguntou sobre um novo pedido"),
  ] },
  { fluxo: "3. Criar pedido", frase: "sim", confere: (t, f) => [
    ...itensIguais(f, [[4, 3]]),
    ...exige(t.includes("1002") && t.includes("24.000"), "não confirmou pedido 1002 e total R$ 24.000"),
  ] },
  { fluxo: "4. Consultar pedido", frase: "Qual o status do pedido 1042?", confere: (t, f) => [
    ...exige(usou(f, "get_order_status", 1042), "não chamou get_order_status(1042)"),
    ...exige(/enviado/i.test(t), "não informou o status enviado"),
  ] },
  { fluxo: "4. Consultar pedido", frase: "E o que eu pedi nele mesmo?", confere: (t, f) => [
    ...semCriar(f),
    ...exige(t.includes("iPhone 15") && t.includes("iPhone 14"), "não listou os itens do pedido 1042"),
  ] },
  { fluxo: "5. Erros", frase: "Me fala do produto 999.", confere: (t, f) => [
    ...exige(usou(f, "get_product", 999), "não chamou get_product(999)"),
    ...exige(/não .*(encontr|exist|localiz)/i.test(t), "não disse que o produto não existe"),
    ...exige(!t.includes("R$"), "inventou um preço"),
  ] },
  { fluxo: "5. Erros", frase: "Quero comprar 1000 unidades do produto 1.", confere: (t, f) => [
    ...semCriar(f),
    ...exige(t.includes("65"), "não informou o estoque disponível (65)"),
  ] },
  { fluxo: "5. Erros", frase: "Qual o status do pedido 9999?", confere: (t, f) => [
    ...exige(usou(f, "get_order_status", 9999), "não chamou get_order_status(9999)"),
    ...exige(/não .*(encontr|exist|localiz)|não foi encontrado/i.test(t), "não disse que o pedido não existe"),
  ] },
  { fluxo: "6. Limites", frase: "Qual a previsão do tempo em SP?", confere: (t, f) => [
    ...semTools(f),
    ...exige(/não posso|não consigo|exclusiv|apenas/i.test(t), "não recusou o assunto"),
    ...exige(/\d+\s*°/.test(t) === false, "inventou uma previsão"),
  ] },
  { fluxo: "6. Limites", frase: "Cancela meu pedido 1042.", confere: (t, f) => [
    ...semCriar(f),
    ...exige(/não .*(cancel|suport|possível)/i.test(t), "não disse que cancelamento não é suportado"),
  ] },
];

// Liga uma API nova só para este teste.
const servidor = spawn(process.execPath, ["--import", "tsx", "src/api/servidor.ts"], { env: process.env, stdio: "ignore" });
let falhas = 0;
const md: string[] = [];

try {
  for (let i = 0; ; i++) {
    try { await fetch(`${api}/products`); break; } catch {
      if (i === 40) throw new Error("A API de teste não subiu.");
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // Importado só agora, para as tools já lerem a porta de teste.
  const { conversar } = await import("../src/agente.js");

  let fluxoAtual = "";
  for (const caso of casos) {
    if (caso.fluxo !== fluxoAtual) {
      fluxoAtual = caso.fluxo;
      console.log(`\n===== Fluxo ${fluxoAtual} =====`);
      md.push(`\n## Fluxo ${fluxoAtual}\n`);
    }
    const tools: Tool[] = [];
    let texto = "";
    let problemas: string[];
    try {
      texto = await conversar(caso.frase, (nome, args) => tools.push({ nome, args }));
      problemas = caso.confere(texto, tools);
    } catch (erro) {
      problemas = [`erro: ${(erro as Error).message}`];
    }
    if (problemas.length) falhas++;
    const situacao = problemas.length ? `FALHOU: ${problemas.join("; ")}` : "PASSOU";
    const usadas = tools.map((t) => `${t.nome}(${JSON.stringify(t.args ?? {})})`).join(", ") || "nenhuma";

    console.log(`\nPergunta: ${caso.frase}\nTools: ${usadas}\nResposta: ${texto}\n[${situacao}]`);
    md.push(`**Pergunta:** ${caso.frase}\n\n**Tools:** \`${usadas}\`\n\n**Resposta:**\n\n${texto}\n\n**Resultado:** ${situacao}\n\n---\n`);
  }

  // Confere na própria API que nada foi alterado além dos dois pedidos pedidos.
  const obter = async (c: string) => { const r = await fetch(api + c); return { status: r.status, dados: (await r.json()) as any }; };
  const finais: [string, boolean][] = [
    ["Estoque do produto 1 = 65", (await obter("/products/1")).dados.estoque === 65],
    ["Estoque do produto 4 = 13", (await obter("/products/4")).dados.estoque === 13],
    ["Estoque do produto 6 = 0", (await obter("/products/6")).dados.estoque === 0],
    ["Pedido 1042 continua enviado", (await obter("/orders/1042")).dados.status === "enviado"],
    ["Nenhum pedido além do 1002 (1003 não existe)", (await obter("/orders/1003")).status === 404],
    ["Produto 999 não existe", (await obter("/products/999")).status === 404],
    ["Pedido 9999 não existe", (await obter("/orders/9999")).status === 404],
  ];
  console.log("\n===== Estado final da loja =====");
  md.push("\n## Estado final da loja\n");
  for (const [nome, ok] of finais) {
    if (!ok) falhas++;
    console.log(`${ok ? "PASSOU" : "FALHOU"}: ${nome}`);
    md.push(`- ${ok ? "PASSOU" : "FALHOU"}: ${nome}`);
  }
} finally {
  servidor.kill();
}

const resumo = falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} VERIFICAÇÃO(ÕES) FALHARAM`;
console.log(`\n${resumo}`);
mkdirSync("docs", { recursive: true });
writeFileSync(
  "docs/transcricoes.md",
  `# Transcrições dos testes de aceite\n\nGerado por \`npm run aceite\`, numa única sessão com histórico e com a API recém-ligada.\n\n**Resultado: ${resumo}**\n${md.join("\n")}\n`,
);
process.exit(falhas === 0 ? 0 : 1);
