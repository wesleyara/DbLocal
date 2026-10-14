---
name: i18n-keys
description: Adiciona ou altera textos da UI do DbLocal em EN e pt-BR. Use sempre que uma tela, componente ou mensagem tiver texto visível ao usuário.
---

# i18n

1. Nenhum texto hardcoded em componente: `const { t } = useI18n()` e `t('dominio.chave')`.
2. Chaves por domínio (`common`, `shell`, `connections`, `grid`, `sql`, ...) em `i18n/locales/en.json` **e** `i18n/locales/pt-BR.json`, com o mesmo conjunto de chaves (`tests/unit/i18n.test.ts` falha se divergir).
3. Números e datas: `useFormat()` (Intl conforme o locale).
4. Mensagens de erro da API: devolva códigos/chaves, a UI traduz.
5. Artigos de ajuda (épico 11) ficam em `content/help/<locale>/` com os mesmos slugs.
6. Rode `pnpm test`.
