# Arquitetura — Agente de atendimento (Runflow)

Documento de planejamento (Etapa 1). **Nenhum código foi escrito.** Serve para você aprovar antes de construirmos.

## 1. Decisões já fechadas

| Tema                       | Decisão                                                                                                                        | Por quê?                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linguagem                  | TypeScript (Node.js)                                                                                                            | O desafio que pede a linguagem                                                                                                                                                            |
| LLM                        | Gemini, modelo `gemini-3.1-flash-lite` (o 2.5 Flash do enunciado foi aposentado; o nome fica em `GEMINI_MODEL` no `.env`) | O desafio sugeriu o 2.5 flash, mas ele foi<br />tirado do ar                                                                                                                              |
| Como falar com o Gemini    | SDK oficial `@google/genai`                                                                                                   | SDK oficial que não necessita de um <br />externo ao google gemini                                                                                                                      |
| API do cliente             | Fastify, dados em memória                                                                                                      | Express é um dos sugeridos pelo desafio, na pesquisa, identifiquei que seria uma forma simples de API pro cliente. Sobre Dados em memória porque não há necessidade de banco de dados |
| Agente                     | Loop de tool calling escrito à mão, sem framework pronto, por simplificação                                                 | Escrito à mão porque não senti a necessidade de implementar frameworks                                                                                                                 |
| Interface                  | Chat no terminal                                                                                                                | Simplicidade e o desafio sugeriu                                                                                                                                                          |
| Nomes no código e no JSON | Português. Só as rotas (`/products`, `/orders`) e as tools (`list_products`...) ficam em inglês, como no enunciado     | --                                                                                                                                                                                        |
| Catálogo                  | Os iPhones (13 a 18)                                                                                                            | --                                                                                                                                                                                        |

OBS: A Fastify

## 2. Estrutura de pastas

Seis arquivos de código, cada um pequeno e com uma responsabilidade só.

```
src/
  api/
    dados.ts      # produtos e pedidos em memória (só dados)
    servidor.ts   # os 4 endpoints do Fastify
  tools.ts        # as 4 tools: descrição para o Gemini + função que chama a API
  prompt.ts       # a system prompt (só um texto)
  agente.ts       # o loop de tool calling e o histórico
  chat.ts         # o chat no terminal
.env.example      # nomes das variáveis, sem valores
.gitignore
package.json
tsconfig.json
README.md
```

Dependências: `fastify` e `@google/genai` (execução); `typescript`, `tsx`, `@types/node` (só desenvolvimento).

## 3. API mock: 4 endpoints

Dados em memória; reiniciar o servidor volta tudo ao início.

| Método  | Rota              | Faz                                                 | Respostas                                                                                                          |
| -------- | ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/products`     | Lista os produtos                                   | 200 com a lista                                                                                                    |
| `GET`  | `/products/:id` | Um produto                                          | 200, ou 404 `{ erro }` se não existir                                                                           |
| `GET`  | `/orders/:id`   | Um pedido                                           | 200, ou 404 `{ erro }` se não existir                                                                           |
| `POST` | `/orders`       | Cria pedido. Corpo: `[{ produtoId, quantidade }]` | 201 com o pedido; 404 se o produto não existe; 400 se o corpo é inválido ou **o estoque é insuficiente** |

Formato dos dados:

- Produto: `{ id, nome, preco, estoque }`
- Pedido: `{ id, status, itens: [{ produtoId, nome, quantidade, precoUnitario }], total }`
- Status possíveis: `em_processamento`, `enviado`, `entregue`

Regra do `POST /orders`: primeiro valida **todos** os itens (existência e estoque); só se tudo estiver certo desconta o estoque e cria o pedido. Se um item falhar, nada é alterado. A mensagem de erro é clara, por exemplo: `Estoque insuficiente para "iPhone 14": pedido de 1000, disponível 22.`

## 4. As 4 tools

O Gemini lê o nome e a descrição para decidir **quando** usar cada uma. Quem executa é o nosso código.

| Tool                 | Descrição (o que o Gemini lê)                                                                                             | Parâmetros                                       | Chama                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------- |
| `list_products`    | Lista todos os produtos com id, nome, preço e estoque. Use para perguntas gerais sobre o catálogo.                         | nenhum                                            | `GET /products`     |
| `get_product`      | Detalhes de um produto pelo id.                                                                                              | `id` (inteiro)                                  | `GET /products/:id` |
| `get_order_status` | Status, itens e total de um pedido pelo id.                                                                                  | `id` (inteiro)                                  | `GET /orders/:id`   |
| `create_order`     | Cria um pedido novo. Só use quando produtos e quantidades estiverem claros. Pedidos não podem ser editados nem cancelados. | `itens`: lista de `{ produtoId, quantidade }` | `POST /orders`      |

Cada tool devolve ao Gemini o resultado em JSON, ou `{ erro: "mensagem" }` se algo falhou. Nenhuma tool lança exceção.

## 5. Como o loop do agente funciona

1. O usuário digita uma mensagem no chat.
2. O agente a coloca no **histórico** (lista de tudo o que foi dito) e chama o Gemini, enviando: histórico + system prompt + lista de tools.
3. O Gemini responde com **texto** ou com o **pedido de uma tool**.
4. Se pediu uma tool: o agente a executa (um `fetch` na API da loja), guarda o pedido e o resultado no histórico e volta ao passo 2.
5. Se respondeu com texto: o agente guarda no histórico, mostra ao usuário e espera a próxima mensagem.
6. Segurança: no máximo 6 voltas por mensagem, para não girar para sempre.

O Gemini **nunca executa nada**: só pede. E como o histórico inteiro é reenviado a cada chamada, ele entende "o último que você mostrou" e "nele mesmo".

## 6. Dados de exemplo

**Produtos** (IDs sequenciais; maior estoque é 67, longe de 1000):

| id | nome      | preço    | estoque     |
| -- | --------- | --------- | ----------- |
| 1  | iPhone 13 | R$ 4.000  | 67          |
| 2  | iPhone 14 | R$ 5.000  | 22          |
| 3  | iPhone 15 | R$ 6.000  | 45          |
| 4  | iPhone 16 | R$ 8.000  | 17          |
| 5  | iPhone 17 | R$ 10.000 | 17          |
| 6  | iPhone 18 | R$ 12.500 | **0** |

**Pedidos já existentes** (os novos começam em 1043):

| id   | status           | itens                      | total     |
| ---- | ---------------- | -------------------------- | --------- |
| 1040 | entregue         | 1x iPhone 14, 1x iPhone 17 | R$ 15.000 |
| 1041 | em_processamento | 1x iPhone 16               | R$ 8.000  |
| 1042 | enviado          | 2x iPhone 15, 1x iPhone 14 | R$ 17.000 |

**Não existem:** produto 999 e pedido 9999 (os produtos só vão de 1 a 6, e os pedidos são 1040 a 1042).

## 7. Testes de aceite: o que cada um usa

| Fluxo | Mensagem                                     | Esperado                                                                                                                                                                                        | Depende de                                              |
| ----- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1     | "Quais produtos vocês têm disponíveis?"   | chama `list_products`                                                                                                                                                                         | lista com o iPhone 18 marcado sem estoque               |
| 1     | "Me mostra só os que estão em estoque."    | filtra por raciocínio                                                                                                                                                                          | iPhone 18 com estoque 0                                 |
| 2     | "Me conta mais sobre o produto 3."           | `get_product(3)`                                                                                                                                                                              | iPhone 15                                               |
| 2     | "E quanto custa o produto 2?"                | `get_product(2)`, mantém contexto                                                                                                                                                            | iPhone 14                                               |
| 3     | "2 do produto 1 e 1 do produto 4"            | `create_order`, confirma ID e total                                                                                                                                                           | estoque 67 e 17; total R$ 16.000, pedido **1043** |
| 3     | "Adiciona 3 do último que você me mostrou" | usa o contexto para achar o produto (iPhone 16) e **pergunta** se pode criar um novo pedido com 3 unidades, pois pedidos não são editáveis. Só chama `create_order` depois do "sim" | estoque do produto 4 (16 após o primeiro pedido)       |
| 4     | "Qual o status do pedido 1042?"              | `get_order_status(1042)`                                                                                                                                                                      | pedido 1042 existe                                      |
| 4     | "E o que eu pedi nele mesmo?"                | lista os itens sem perguntar o ID                                                                                                                                                               | histórico                                              |
| 5     | "Me fala do produto 999."                    | resposta útil, sem inventar                                                                                                                                                                    | 404 da API                                              |
| 5     | "Quero comprar 1000 unidades do produto 1."  | explica a limitação e **não cria** pedido                                                                                                                                              | 400 por estoque (disponível 67)                        |
| 5     | "Qual o status do pedido 9999?"              | informa que não existe                                                                                                                                                                         | 404 da API                                              |
| 6     | "Qual a previsão do tempo em SP?"           | recusa e volta ao assunto da loja                                                                                                                                                               | system prompt                                           |
| 6     | "Cancela meu pedido 1042."                   | diz que não é suportado, sem fingir                                                                                                                                                           | system prompt (não existe tool de cancelar)            |

## 8. Tratamento de erros (básico)

- **Produto ou pedido inexistente:** a API devolve 404; a tool repassa `{ erro }`; o agente avisa SEM INVENTAR NADA.
- **Estoque insuficiente:** a API recusa o pedido inteiro (400); o agente EXPLICA e não cria nada.
- **Argumentos inválidos** (id que não é número, lista vazia): a tool valida antes de chamar a API.
- **API da loja fora do ar:** a tool devolve uma mensagem clara; o chat também avisa ao iniciar.
- **Falha do Gemini:** o chat mostra uma mensagem em português e desfaz aquele turno, para o histórico não ficar quebrado.

## 9. Fora do escopo (de propósito)

Docker, banco de dados, autenticação, testes automatizados, streaming, framework de agente e qualquer funcionalidade além das 4 tools (por exemplo, cancelar ou editar pedido).

## 10. Pontos de decisão

Já decididos por você:

- **"Adiciona também 3 unidades do último..." (opção B):** o agente **pergunta antes** de criar. Ele explica que pedidos não podem ser editados e oferece criar um novo pedido com as 3 unidades; só chama `create_order` depois que o usuário confirmar. No teste de aceite, isso vira duas mensagens: o pedido do iPhone 16 e depois o "sim".
- **Limite de 6 voltas** do loop por mensagem: mantido.

Ainda aguardando a sua resposta (escolhas minhas):

1. **Sem `dotenv`.** O Node 20.6 ou superior lê o `.env` sozinho (`--env-file`), então dá para evitar mais uma biblioteca. Exige Node 20.6+.
2. **Retry simples nos erros 429 e 503 do Gemini** (até 3 tentativas, esperando alguns segundos). Está um pouco além do README, mas o plano gratuito limita o uso por minuto e, sem isso, o chat falha com facilidade. Se preferir, tiramos e o chat só avisa o erro.
3. **Comandos do chat:** só `sair`. (Antes havia também `limpar`.)
