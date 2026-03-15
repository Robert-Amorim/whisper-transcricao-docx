# HTML para React + Tailwind (Padrão do Projeto)

Este projeto usa Tailwind **local** (não CDN) para manter fidelidade visual e previsibilidade no React.

## Stack ativa

- React 19 + Vite
- React Router
- Tailwind CSS 3.4 (`tailwind.config.ts`)
- PostCSS (`postcss.config.mjs`)
- Plugins: `@tailwindcss/forms`, `@tailwindcss/container-queries`

## Fluxo recomendado

1. Copie o HTML base da tela.
2. Converta para TSX:
   - `class` -> `className`
   - `for` -> `htmlFor`
   - `onclick` -> `onClick`
3. Mantenha utilitários Tailwind como estão (não "simplificar" de primeira).
4. Troque links internos por `Link` do `react-router-dom`.
5. Troque imagens por `<img />` e otimize manualmente quando necessário.
6. Teste desktop + mobile antes de refatorar.

## Regras para fidelidade visual

- Evite CSS global novo para layout de página.
- Prefira utilitários Tailwind no próprio componente.
- Só use CSS em `globals.css` para:
  - tokens globais
  - estilos utilitários reutilizáveis entre várias telas
- Mantenha as cores no `tailwind.config.ts` (fonte única).

## Comandos úteis

```bash
# desenvolvimento
npm run dev --workspace @voxora/web

# build de validação
npm run build --workspace @voxora/web

# typecheck
npm run typecheck --workspace @voxora/web
```

## Tokens principais de cor

- `primary`: `#2b8cee`
- `background-light`: `#f6f7f8`
- `background-dark`: `#111418`
- `surface-dark`: `#1c2127`
- `text-main`: `#111418`
- `text-muted`: `#637588`
