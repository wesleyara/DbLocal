---
name: ui-component
description: Cria ou altera componentes de UI do DbLocal seguindo o design system (Reka UI + tokens Tailwind). Use ao adicionar componente em app/components, mexer em estilo ou cores.
---

# Componentes de UI

1. Primitivos ficam em `app/components/ui/` (auto-import com prefixo `Ui`). Features em `app/components/<dominio>/`.
2. Base: Reka UI headless; sem Nuxt UI/shadcn.
3. Cores **só** por tokens (`bg-surface`, `text-fg-muted`, `border-border`, `text-type-*`, `text-env-*`). Nunca hex/rgb em componente; novo token entra em `app/assets/css/main.css` nos dois temas (dark e `[data-theme='light']`) e em `@theme inline`.
4. Dados, células, SQL e identificadores: classe `font-data` (JetBrains Mono, tabular nums).
5. Densidade compacta (alturas 24/28/36px), bordas finas, foco via `:focus-visible` com o acento.
6. Acessibilidade: rótulos (`aria-label`/`label` prop), teclado herdado do Reka UI.
7. Sem texto fixo: strings via `t()` (ver skill `i18n-keys`).
8. Mostre o novo componente em `app/pages/_design.vue`, confira nos dois temas.
9. `pnpm lint && pnpm typecheck`.
