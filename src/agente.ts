import { GoogleGenAI, ApiError, type Content, type Part } from "@google/genai";
import { declaracoes, executarTool } from "./tools.js";
import { systemPrompt } from "./prompt.js";

const MODELO = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const MAX_VOLTAS = 6; // evita girar para sempre se o Gemini ficar pedindo tools
const MAX_TENTATIVAS = 3; // para erros temporários do Gemini (429 e 503)

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// O histórico: tudo o que foi dito, pedido e respondido. É reenviado inteiro a cada chamada,
// porque o Gemini não tem memória própria.
const historico: Content[] = [];

const esperar = (segundos: number) => new Promise((r) => setTimeout(r, segundos * 1000));

// Chama o Gemini. Nos erros temporários (429 limite por minuto, 503 sobrecarga) espera e tenta de novo.
async function chamarGemini() {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await ai.models.generateContent({
        model: MODELO,
        contents: historico,
        config: { systemInstruction: systemPrompt, tools: [{ functionDeclarations: declaracoes }] },
      });
    } catch (erro) {
      const temporario = erro instanceof ApiError && (erro.status === 429 || erro.status === 503);
      if (!temporario || tentativa >= MAX_TENTATIVAS) throw erro;
      // O 429 do Google diz quanto esperar ("retry in 31.7s"); no 503 esperamos 2s, 4s...
      const informado = /retry in ([\d.]+)s/i.exec((erro as Error).message);
      const segundos = informado ? Math.min(Math.ceil(Number(informado[1])), 60) : 2 * tentativa;
      console.log(`  (Gemini ocupado, tentando de novo em ${segundos}s...)`);
      await esperar(segundos);
    }
  }
}

// Traduz os erros do Gemini para uma mensagem em português.
function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ApiError) {
    if (erro.status === 429) return "O Gemini atingiu o limite de uso por minuto. Aguarde um instante e tente de novo.";
    if (erro.status === 503) return "O Gemini está sobrecarregado agora. Tente de novo em instantes.";
    if (erro.status === 404) return "O modelo do Gemini não foi encontrado. Confira o GEMINI_MODEL no .env.";
    if ([400, 401, 403].includes(erro.status)) return "O Gemini recusou o pedido. Confira a GEMINI_API_KEY no .env.";
  }
  return "Não consegui falar com o Gemini agora. Tente de novo.";
}

// Uma mensagem do usuário -> a resposta do agente. Aqui está o loop de tool calling.
export async function conversar(
  mensagem: string,
  aoUsarTool?: (nome: string, args: unknown) => void, // só para o chat mostrar qual tool foi usada
): Promise<string> {
  const tamanhoAntes = historico.length;
  historico.push({ role: "user", parts: [{ text: mensagem }] });

  try {
    for (let volta = 0; volta < MAX_VOLTAS; volta++) {
      const resposta = await chamarGemini();

      // Guarda a resposta do Gemini no histórico EXATAMENTE como veio (os modelos 3 exigem isso).
      const conteudo = resposta.candidates?.[0]?.content;
      if (!conteudo) throw new Error("O Gemini não devolveu conteúdo.");
      historico.push(conteudo);

      const pedidos = resposta.functionCalls;
      if (!pedidos || pedidos.length === 0) return resposta.text ?? ""; // texto final: fim do loop

      // O Gemini só PEDIU as tools. Quem executa somos nós; depois devolvemos os resultados.
      const resultados: Part[] = [];
      for (const pedido of pedidos) {
        const nome = pedido.name ?? "";
        aoUsarTool?.(nome, pedido.args);
        const resultado = await executarTool(nome, pedido.args ?? {});
        resultados.push({
          functionResponse: { id: pedido.id, name: nome, response: resultado as Record<string, unknown> },
        });
      }
      historico.push({ role: "user", parts: resultados });
    }

    // Estourou as voltas: desfaz o turno para o histórico não ficar quebrado.
    historico.length = tamanhoAntes;
    return "Desculpe, não consegui concluir esse pedido. Pode tentar de novo, de outra forma?";
  } catch (erro) {
    historico.length = tamanhoAntes; // falhou: desfaz o turno
    throw new Error(mensagemDeErro(erro));
  }
}