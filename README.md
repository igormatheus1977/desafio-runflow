# Agente de atendimento para loja de iPhones

Agente conversacional (Gemini + tool calling) que atende clientes de uma loja online de iPhones. O usuário conversa em linguagem natural, no terminal; o agente consulta produtos, consulta pedidos e cria pedidos chamando uma API mock da loja.

## Como rodar

Requisitos: Node.js 20.6 ou superior (o Node lê o `.env` sozinho, por isso não uso `dotenv`) e uma chave do Gemini ([aistudio.google.com](https://aistudio.google.com), "Get API key").

```bash
npm install
cp .env.example .env     # preencha GEMINI_API_KEY (e, se quiser, GEMINI_MODEL e API_PORT)
```

Em **dois terminais**:

```bash
npm run api     # terminal 1: liga a API da loja (mock)
npm run chat    # terminal 2: abre o chat com o agente (digite "sair" para encerrar)
```

Checagem de tipos: `npm run typecheck`.

Testes de aceite: `npm run aceite` (liga sozinho uma API própria na porta 3100, não precisa dos dois terminais; usa o Gemini de verdade).

| Variável | Para que serve |
| --- | --- |
| `GEMINI_API_KEY` | Chave do Gemini (só no `.env`, fora do Git) |
| `GEMINI_MODEL` | Modelo usado (padrão `gemini-3.1-flash-lite`) |
| `API_PORT` | Porta da API da loja (padrão `3000`) |

## Como funciona

```
Usuário (terminal) → chat.ts → agente.ts ⇄ Gemini
                                   ↓ o Gemini PEDE uma tool; o nosso código executa
                               tools.ts → fetch → API da loja (Fastify) → JSON
```

```
src/
  api/dados.ts      produtos e pedidos em memória
  api/servidor.ts   os 4 endpoints (Fastify)
  tools.ts          as 4 tools: descrição para o Gemini + função que chama a API
  prompt.ts         a system prompt
  agente.ts         o loop de tool calling e o histórico
  chat.ts           o chat no terminal
scripts/aceite.ts     roda os 6 fluxos e confere as respostas
docs/transcricoes.md  a saída gerada pelo script
```

**API da loja (mock, dados em memória):** `GET /products`, `GET /products/:id`, `GET /orders/:id`, `POST /orders`. O `POST /orders` valida **todos** os itens (existência e estoque) antes de alterar qualquer coisa: se um item falha, nada é descontado.

**Tools:** `list_products`, `get_product`, `get_order_status`, `create_order`. Cada uma valida os argumentos e devolve o JSON da API ou `{ erro }`. Nenhuma lança exceção.

**Loop do agente:** a cada mensagem, o agente envia ao Gemini o histórico completo, a system prompt e as tools. Se o Gemini pedir uma tool, o agente a executa, guarda o pedido e o resultado no histórico e chama o Gemini de novo; quando ele responde com texto, o texto vai ao usuário. Limite de 6 voltas por mensagem.

## Decisões técnicas

- **TypeScript + Node:** tipos evitam erros de formato nos dados e nos argumentos das tools. Executado com `tsx`, sem etapa de build.
- **Gemini `gemini-3.1-flash-lite`:** o `gemini-2.5-flash` do enunciado foi aposentado para contas novas (erro 404). O nome do modelo fica em `GEMINI_MODEL`. Nos modelos "flash" completos o plano gratuito limitou a cerca de 5 requisições por minuto (cada mensagem com tool gasta 2); o `flash-lite` aguentou o fluxo de testes.
- **SDK oficial `@google/genai`:** dispensa montar as requisições HTTP à mão.
- **Loop escrito à mão, sem framework de agente:** o loop tem poucas linhas e deixa claro o que é tool calling: o modelo só pede, o nosso código executa.
- **Fastify, dados em memória:** servidor simples e com TypeScript embutido; não há necessidade de banco para um mock.
- **Poucos arquivos, uma responsabilidade cada:** dados, rotas, tools, prompt, agente e chat.
- **Nomes em português** nos campos, variáveis e mensagens; rotas e nomes das tools em inglês, como no enunciado.
- **Pedidos não são editáveis:** se o cliente pede para "adicionar" itens, o agente explica e **pergunta** se pode criar um novo pedido; só chama `create_order` depois do "sim".
- **Consulta obrigatória quando o cliente cita um número:** nos testes, o agente respondeu sobre o produto 999 só pelo histórico, sem chamar a tool. A system prompt agora exige a consulta, porque o dado pode ter mudado e só a loja pode dizer que algo não existe.
- **Histórico guardado como veio:** com os modelos Gemini 3, a resposta do modelo (com os pedidos de tool) deve ser mantida exatamente como recebida.

## Tratamento de erros

- **Produto ou pedido inexistente:** a API devolve 404, a tool repassa `{ erro }` e o agente informa sem inventar.
- **Estoque insuficiente:** a API recusa o pedido inteiro (400); o agente explica o estoque disponível e não cria nada.
- **Argumentos inválidos** (id não numérico, lista vazia, quantidade negativa): a tool valida antes de chamar a API.
- **Tool desconhecida** (ex.: `cancel_order`): devolve `{ erro }` em vez de quebrar; não existe tool de cancelamento, então o agente não consegue "fingir" que cancelou.
- **API da loja fora do ar:** o chat avisa ao iniciar e a tool devolve uma mensagem clara.
- **Gemini com 429 ou 503:** até 3 tentativas, esperando o tempo informado pelo Google (429) ou 2s, 4s (503). Se falhar de vez, o chat mostra uma mensagem em português e o turno é desfeito para o histórico não ficar quebrado.

## Testes de aceite (transcrição)

Os 6 fluxos do enunciado (13 mensagens, mais o "sim" de confirmação), numa única sessão com histórico e com a API recém-ligada (estoque inicial). Saída real de `npm run aceite`, que também grava [docs/transcricoes.md](docs/transcricoes.md). A linha `[tool]` mostra a tool que o agente chamou. O estoque de 65 no teste de 1000 unidades é o valor real naquele momento: o pedido 1043 já tinha descontado 2 unidades do iPhone 13 (67 - 2).

```
Você: Quais produtos vocês têm disponíveis?
  [tool] list_products({})

Agente: Temos os seguintes modelos disponíveis:

*   iPhone 13: R$ 4.000,00
*   iPhone 14: R$ 5.000,00
*   iPhone 15: R$ 6.000,00
*   iPhone 16: R$ 8.000,00
*   iPhone 17: R$ 10.000,00

O iPhone 18 está sem estoque no momento. Algum desses modelos lhe interessa?
  [PASSOU]

Você: Me mostra só os que estão em estoque.

Agente: Todos os modelos listados anteriormente estão em estoque, com exceção do iPhone 18. Aqui estão eles:

* iPhone 13: R$ 4.000,00
* iPhone 14: R$ 5.000,00
* iPhone 15: R$ 6.000,00
* iPhone 16: R$ 8.000,00
* iPhone 17: R$ 10.000,00

Deseja saber mais detalhes sobre algum deles ou realizar um pedido?
  [PASSOU]

Você: Me conta mais sobre o produto 3.
  [tool] get_product({"id":3})

Agente: O iPhone 15 custa R$ 6.000,00 e temos 45 unidades disponíveis em estoque. Deseja realizar o pedido?
  [PASSOU]

Você: E quanto custa o produto 2?
  [tool] get_product({"id":2})

Agente: O iPhone 14 custa R$ 5.000,00 e temos 22 unidades em estoque. Gostaria de comprar algum deles?
  [PASSOU]

Você: Quero 2 unidades do produto 1 e 1 unidade do produto 4
  [tool] create_order({"itens":[{"quantidade":2,"produtoId":1},{"quantidade":1,"produtoId":4}]})

Agente: Pedido realizado com sucesso! O número do seu pedido é 1043 e o total é R$ 16.000,00. Posso ajudar em algo mais?
  [PASSOU]

Você: Adiciona 3 do último que você me mostrou

Agente: Sinto muito, mas não é possível editar pedidos já realizados. Caso deseje os itens adicionais, posso criar um novo pedido para você. Deseja seguir com a criação de um novo pedido para 3 unidades do iPhone 16?
  [PASSOU]

Você: sim
  [tool] create_order({"itens":[{"quantidade":3,"produtoId":4}]})

Agente: Pedido realizado com sucesso! O número do novo pedido é 1044 e o total é R$ 24.000,00. Precisa de mais alguma ajuda?
  [PASSOU]

Você: Qual o status do pedido 1042?
  [tool] get_order_status({"id":1042})

Agente: O pedido 1042 está com status "enviado". Ele contém:

* 2 unidades de iPhone 15
* 1 unidade de iPhone 14

O total do pedido é R$ 17.000,00. Posso ajudar em algo mais?
  [PASSOU]

Você: E o que eu pedi nele mesmo?

Agente: No pedido 1042, você solicitou:

* 2 unidades de iPhone 15
* 1 unidade de iPhone 14

Deseja verificar mais alguma informação?
  [PASSOU]

Você: Me fala do produto 999.
  [tool] get_product({"id":999})

Agente: Não encontrei nenhum produto com o ID 999 em nosso catálogo. Posso ajudar com mais alguma coisa?
  [PASSOU]

Você: Quero comprar 1000 unidades do produto 1.
  [tool] get_product({"id":1})

Agente: Infelizmente, não temos essa quantidade em estoque. No momento, temos apenas 65 unidades do iPhone 13 disponíveis. Deseja realizar um pedido com uma quantidade menor?
  [PASSOU]

Você: Qual o status do pedido 9999?
  [tool] get_order_status({"id":9999})

Agente: O pedido 9999 não foi encontrado em nosso sistema. Posso ajudar com mais alguma coisa?
  [PASSOU]

Você: Qual a previsão do tempo em SP?

Agente: Sinto muito, mas não posso te ajudar com essa informação. Meu atendimento é restrito a assuntos sobre produtos e pedidos da nossa loja. Posso te ajudar com algo relacionado a eles?
  [PASSOU]

Você: Cancela meu pedido 1042.

Agente: Não é possível cancelar pedidos, pois essa função não é suportada pelo nosso sistema. Posso ajudar com mais alguma outra informação sobre os nossos produtos ou pedidos?
  [PASSOU]

Estado final da loja:
PASSOU: Estoque do produto 1 = 65
PASSOU: Estoque do produto 4 = 13
PASSOU: Estoque do produto 6 = 0
PASSOU: Pedido 1042 continua enviado
PASSOU: Nenhum pedido além do 1044 (1045 não existe)
PASSOU: Produto 999 não existe
PASSOU: Pedido 9999 não existe

TODOS OS TESTES PASSARAM
```

## Fora do escopo (de propósito)

Docker, banco de dados, autenticação, testes automatizados além do script de aceite, streaming, framework de agente e qualquer funcionalidade além das 4 tools (por exemplo, cancelar ou editar pedidos).

## O que eu faria diferente com mais tempo

- **Testes automatizados** dos endpoints e das tools, separados do Gemini (hoje o script de aceite testa o conjunto, sempre com o modelo real).
- **Banco de dados real** no lugar dos arrays em memória, para o estoque e os pedidos sobreviverem a reinícios.
- **Streaming** da resposta, para o texto aparecer enquanto o modelo escreve.
- **Cancelamento e edição de pedidos** como novas tools, com confirmação explícita do cliente.
- **Autenticação**: hoje qualquer pessoa consulta qualquer pedido pelo número.
- **Logs estruturados** das chamadas ao Gemini e às tools, e uma avaliação mais robusta das respostas (o script de aceite confere as tools chamadas e procura trechos no texto, e o modelo varia de uma execução para outra, então o ideal é rodar várias vezes).
- **Histórico com limite**: reenviar a conversa inteira cresce a cada mensagem; numa conversa muito longa seria preciso resumir ou truncar.
