import * as readline from "node:readline";
import { conversar } from "./agente.js";

// Antes de começar, confere se a API da loja está no ar (as tools dependem dela).
const urlBase = `http://127.0.0.1:${process.env.API_PORT || 3000}`;
try {
  await fetch(`${urlBase}/products`);
} catch {
  console.log("A API da loja não está no ar. Em outro terminal, rode: npm run api");
  process.exit(1);
}

console.log("Atendimento da loja de iPhones. Digite sua mensagem, ou 'sair' para encerrar.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let fechado = false;
rl.on("close", () => (fechado = true));
rl.setPrompt("Você: ");
if (process.stdin.isTTY) rl.prompt();

// Lê uma linha por vez; o próximo prompt só aparece depois que o agente responde.
for await (const linha of rl) {
  const texto = linha.trim();
  if (texto.toLowerCase() === "sair") break;

  if (texto) {
    // Se as mensagens vêm de um arquivo (e não do teclado), mostra a mensagem para a transcrição ficar completa.
    if (!process.stdin.isTTY) console.log(`Você: ${texto}`);
    try {
      const resposta = await conversar(texto, (nome, args) => console.log(`  [tool] ${nome}(${JSON.stringify(args)})`));
      console.log(`\nAgente: ${resposta}\n`);
    } catch (erro) {
      console.log(`\n${(erro as Error).message}\n`); // o agente já desfez o turno com falha
    }
  }
  if (process.stdin.isTTY && !fechado) rl.prompt(); // só no teclado; de arquivo o readline pode já ter fechado
}

rl.close();
console.log("Até logo!");
