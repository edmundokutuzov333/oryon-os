# DESIGN_SYSTEM.md — OryonOS

Documento normativo de UI. Nenhum valor visual deve ser inventado fora deste sistema.

## Identidade

1. Superfícies em camadas, com limites interiores subtis em vez de sombras no tema escuro.
2. Chrome flutuante, destacado das margens.
3. Hierarquia explícita de raios.
4. Um único acento cromático, lima, usado com parcimónia.
5. Painel de dados invertido em branco puro.
6. Numerais como conteúdo de destaque.

## Cores

```css
--color-acid-500: #C3F53C;
--color-ink-950: #0B0B0C;
--color-ink-900: #111113;
--color-ink-850: #17181A;
--color-ink-800: #1E2023;
--color-ink-750: #26282C;
--color-ink-700: #2F3236;
--color-ink-600: #3C4045;
--color-ink-500: #5B6067;
--color-ink-400: #80858D;
--color-ink-300: #A5AAB2;
--color-ink-200: #C9CDD3;
--color-ink-100: #E7E9EC;
--color-ink-050: #F4F5F7;
--color-ink-000: #FFFFFF;
--color-warning: #F5A524;
--color-danger: #FF4D5E;
--color-info: #4D9FFF;
```

## Tipografia

Geist para interface e Geist Mono exclusivamente para valores, IDs, timestamps e contagens. Todos os numerais usam `tabular-nums`.

## Raios

`xs 6px`, `sm 10px`, `md 14px`, `lg 20px`, `xl 28px`, `2xl 36px`, `full 9999px`.

## Espaçamento

Base 4px e grelha de 8px. Canvas desktop usa 24px; mobile 12px. Chrome flutuante mantém 16px das margens.

## Responsividade

Piso 360px. Breakpoints principais 480, 768, 1024, 1280, 1536, 1920, 2560 e 3440px. Alvo de toque mínimo 44×44px abaixo de md.

## Proibições

Sem segundo acento cromático, gradientes decorativos, glassmorphism, sombras coloridas, raio único, ou ícones decorativos indiscriminados.
