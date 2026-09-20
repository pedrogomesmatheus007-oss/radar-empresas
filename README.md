# Radar de Empresas — versão completa

Aplicação para pesquisar empresas reais por nicho e gerar listas de URLs e
CNPJs verificados, com triagem de conformidade com as políticas do Google
Ads. **Nada aqui é inventado**: todo resultado passa por verificação real
(HTTP para URLs, BrasilAPI/ReceitaWS para CNPJ) antes de ser salvo e exibido;
quando algo não pode ser confirmado, a tela mostra isso explicitamente em vez
de preencher com um valor fictício.

Este é um projeto Node.js/Express que roda **no seu computador**. Ele não
depende de nenhum serviço externo além da API da Anthropic (para encontrar
candidatos via busca na web) e das APIs públicas de CNPJ — não há servidor
hospedado por mim, e os dados salvos (banco SQLite) ficam só na sua máquina.

## 1. Pré-requisitos

- **Node.js 20 ou mais recente** — baixe em https://nodejs.org (baixe a
  versão "LTS"). Para conferir se já está instalado, abra um terminal e
  rode: `node --version` (precisa aparecer `v20` ou mais).
- **Uma chave de API da Anthropic** — crie uma gratuitamente/com créditos em
  https://console.anthropic.com/settings/keys. É ela quem paga as buscas na
  web feitas pelo sistema; sem ela, a aplicação abre normalmente mas as
  buscas retornam um erro explicando que a chave não foi configurada (nunca
  inventa resultado).

## 2. Instalação (só na primeira vez)

Abra um terminal dentro da pasta `backend` deste projeto e rode:

```bash
cd backend
npm install
cp .env.example .env
```

Agora abra o arquivo `.env` (criado pelo comando acima) em qualquer editor de
texto e cole sua chave na linha:

```
ANTHROPIC_API_KEY=sk-ant-...sua-chave-aqui...
```

Salve o arquivo. Pronto — não precisa mexer em mais nada nele para começar a
usar (os outros valores já vêm com padrões razoáveis).

## 3. Rodando a aplicação

Sempre que quiser usar a ferramenta, dentro da pasta `backend`, rode:

```bash
npm run dev
```

O terminal vai mostrar algo como `Servidor rodando em http://localhost:3333`.
Abra esse endereço no navegador — é a aplicação completa, com a mesma
interface que você já aprovou no protótipo, agora fazendo buscas reais.

Para parar o servidor, volte ao terminal e pressione `Ctrl+C`. Para usar de
novo depois, é só rodar `npm run dev` outra vez (não precisa repetir a
instalação).

O banco de dados (arquivo `.sqlite` dentro de `backend/data/`) é criado
automaticamente na primeira execução e **nunca é apagado automaticamente** —
é ele que garante que a mesma URL ou o mesmo CNPJ nunca sejam mostrados duas
vezes, para sempre, mesmo depois de reiniciar o servidor ou o computador.

## 4. Se eu (Claude) mudar algo no código depois

Como a aplicação roda localmente, ela não se atualiza sozinha quando eu faço
uma alteração no chat. O fluxo é: você me pede o ajuste → eu mudo o código →
eu te devolvo os arquivos alterados (ou o projeto inteiro, se for mais
simples) → você substitui os arquivos na sua pasta `backend` → roda
`npm run dev` de novo (ou, se já estava rodando, o `tsx watch` do próprio
`npm run dev` recarrega sozinho ao detectar o arquivo salvo).

Se no futuro você preferir não precisar repetir esse passo manual, existe a
opção de hospedar este mesmo projeto num serviço na nuvem (com URL fixa,
acessível de qualquer lugar) — é só pedir que eu te ajudo a configurar.

## 5. O que muda em relação ao protótipo que você testou

- As buscas demoram um pouco mais (de alguns segundos a cerca de 1 minuto),
  porque agora envolvem busca real na web e verificação real de cada URL/CNPJ
  — o botão de pesquisar mostra "Pesquisando…" enquanto isso acontece.
- "ABRIR SITE" agora é um link de verdade, porque a URL já foi confirmada
  como acessível antes de aparecer na tela.
- Cada URL vem, quando possível, com um CNPJ real emparelhado da mesma
  empresa. Quando não é possível confirmar um CNPJ real para aquela empresa,
  o campo mostra "Não foi possível verificar este dado." em vez de inventar
  um número.
- CNPJs de MEI, de empresas cuja razão social parece ser apenas o nome de
  uma pessoa física, de órgãos públicos e de marcas da sua lista de exclusão
  nunca aparecem — são descartados antes de chegar à tela.
- A dedupliação de URLs e CNPJs agora é permanente de verdade (banco SQLite
  em disco), e não apenas durante a sessão do navegador como no protótipo.
- A aba "Configurações" só mostra o que de fato existe no servidor: o nível
  de sensibilidade da triagem de conformidade foi removido (não existe mais
  como opção ajustável — as regras são fixas), e o período de retenção do
  histórico agora é somente leitura (definido no `.env`, campo
  `RECENT_SEARCHES_RETENTION_DAYS`).
- O selo "Triagem Google Ads" continua **nunca** dizendo "aprovado" — ele
  indica apenas se foram encontrados sinais evidentes de incompatibilidade
  com as políticas públicas do Google Ads. Revise manualmente antes de
  anunciar.

## 6. Limitações conhecidas

- A validação de CNPJ depende de APIs públicas gratuitas (BrasilAPI,
  ReceitaWS) que podem ficar temporariamente fora do ar ou aplicar limite de
  requisições; nesses casos o sistema prefere não incluir o CNPJ a arriscar
  um dado incorreto.
- A busca por candidatos depende da qualidade dos resultados de busca na web
  retornados para o modelo da Anthropic; nichos muito específicos ou pouco
  documentados na internet podem retornar menos resultados do que o
  solicitado — a tela sempre avisa quando isso acontece, em vez de completar
  a lista com dados inventados.
- Este projeto ainda não foi executado de ponta a ponta por mim (as
  ferramentas do ambiente onde ele foi criado não permitem instalar pacotes
  npm nem rodar um servidor Node.js), então você será o primeiro a rodá-lo de
  fato. Se encontrar algum erro ao rodar `npm install` ou `npm run dev`, me
  mande a mensagem de erro completa que aparece no terminal e eu corrijo.

## 7. Estrutura do projeto

```
backend/
  src/            código-fonte do servidor (TypeScript)
  public/         frontend (HTML/CSS/JS) servido pelo próprio backend
  data/           banco de dados SQLite (criado automaticamente)
  .env            suas configurações locais (você cria a partir do .env.example)
ARCHITECTURE.md   decisões técnicas e limitações de fontes de dados
```
