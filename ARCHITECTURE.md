# Arquitetura — Radar de Empresas

## Decisões tomadas com o usuário (19/09/2026)

1. **Descoberta de empresas/sites por nicho**: usa a API da Anthropic (Claude) com a
   tool nativa de busca na web (`web_search_20250305`). O modelo recebe o nicho e a
   lista de marcas excluídas e devolve candidatos (nome da empresa + URL) que ele
   encontrou via busca real. **Nenhum candidato é exibido ao usuário sem passar
   antes pela verificação HTTP real** (`urlValidationService`) — isso é o que
   impede que uma alucinação do modelo vire um resultado mostrado na tela.
2. **Validação de CNPJ**: BrasilAPI (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`),
   gratuita e sem chave, espelha os dados públicos da Receita Federal (Minha
   Receita). Fallback: ReceitaWS. Nenhuma dessas APIs permite *buscar* CNPJs por
   segmento/CNAE — por isso a descoberta de candidatos a CNPJ também passa pela
   Anthropic API (mesmo mecanismo do item 1), e cada candidato é então validado
   individualmente nessas APIs antes de ser exibido.
3. **Entrega**: projeto completo (frontend + backend + banco) para rodar
   localmente via npm. Este ambiente não expõe URL pública, então não há deploy
   ao vivo — as instruções de instalação estão no README.

## Por que essa arquitetura cumpre a regra de "nunca inventar dados"

Toda informação exibida passa por uma cadeia de verificação independente da
"descoberta":

- **URLs**: descoberta (Anthropic) → normalização de domínio → checagem contra o
  banco de já-usados → checagem HTTP/HTTPS real (`fetch` com timeout) → análise
  básica de conteúdo → triagem de compliance. Se qualquer etapa falhar, o
  candidato é descartado, nunca "consertado" com dados inventados.
- **CNPJ**: descoberta (Anthropic) → validação matemática do dígito verificador →
  consulta na BrasilAPI/ReceitaWS → só é exibido se a fonte oficial confirmar
  existência, situação ATIVA, natureza jurídica e regime (não-MEI). Se a fonte
  não responder, o item é descartado (nunca exibido como "verificado"), e o
  serviço registra `"Não foi possível verificar este registro."` em vez de
  preencher os campos.
- **Triagem Google Ads**: `complianceService` é isolado dos serviços de
  descoberta. Ele nunca usa a palavra "aprovado"; classifica em
  `PASS_REVIEW` ("APTO PARA REVISÃO"), `MANUAL_REVIEW` ("REVISÃO NECESSÁRIA") ou
  `REJECT` (descartado antes de chegar ao usuário). As categorias usadas vêm das
  páginas públicas de política do Google Ads (citadas no código e no README).

## Limitação conhecida e documentada

Os nomes exatos dos campos JSON da BrasilAPI/ReceitaWS não puderam ser
confirmados ao vivo durante a construção deste projeto (a documentação da
BrasilAPI carrega via JavaScript e o `robots.txt` de consulta direta bloqueou a
verificação automatizada). O `cnpjValidationService` foi escrito de forma
defensiva: ele aceita variações conhecidas de nomes de campo e, se um campo
esperado não vier na resposta, marca explicitamente
`"Não foi possível verificar este dado"` em vez de assumir um valor. Recomenda-se
testar com um CNPJ real conhecido (o README traz um passo a passo) e ajustar o
mapeamento de campos em `backend/src/services/cnpjValidationService.ts` caso a
API tenha mudado o formato.

## Estrutura de pastas

```
empresa-radar/
├── backend/          # Node.js + TypeScript + Express + SQLite
│   └── src/
│       ├── config/       # variáveis de ambiente
│       ├── db/           # schema.sql + acesso ao banco
│       ├── services/     # discovery, validação de URL, CNPJ, compliance, marcas, histórico
│       ├── routes/       # endpoints REST
│       ├── middleware/   # rate limit, validação, erros
│       └── utils/        # logger, normalização de domínio, validação de CNPJ
├── frontend/         # React + TypeScript + Vite
│   └── src/
│       ├── pages/        # Urls, Cnpj, RecentSearches, ExcludedBrands, Settings, Home
│       ├── components/
│       └── services/     # cliente da API
└── README.md
```
