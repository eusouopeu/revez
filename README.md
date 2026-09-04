# Revez

PWA para lembrar e planejar financeiramente a reposição de itens
cotidianos (fones, roupa de cama, travesseiro, meias, etc.): cadastre um
item, o app calcula quando ele deve ser trocado e quanto guardar por mês
para isso, somando tudo em uma mensalidade única.

100% local — sem conta, sem backend. Os dados ficam em IndexedDB no
dispositivo.

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4 (fonte Montserrat, ícones Heroicons)
- Dexie (IndexedDB)
- Capacitor (para notificações locais e empacotamento nativo)

## Rodando localmente

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Empacotar com Capacitor

```bash
npm run build
npx cap add ios      # ou: npx cap add android
npx cap sync
npx cap open ios      # ou: npx cap open android
```

## Domínio e cálculos

A lógica de negócio é toda função pura em [`src/domain/`](src/domain):

- `calculations.ts` — data da próxima troca, projeção de preço e cálculo
  da provisão mensal por item.
- `dates.ts` — utilitários de data. Note `parseISODate`: toda data
  `YYYY-MM-DD` vinda do banco deve passar por ela, nunca por
  `new Date(iso)` diretamente (esse último interpreta a string como UTC e
  desloca um dia para trás no fuso horário do Brasil).

O método de cálculo da mensalidade (provisão por item vs. custo médio
perpétuo) está documentado em
[`docs/PROVISIONING-METHODS.md`](docs/PROVISIONING-METHODS.md), incluindo
como trocar de método.

## Notificações

Três tipos, agendados via `@capacitor/local-notifications` sempre que
itens, compras ou ajustes mudam (`src/notifications/scheduler.ts`):

1. Aviso X dias antes da data de troca (configurável em Ajustes).
2. Aviso no dia da troca.
3. Resumo mensal com o valor total a guardar.

Notificações locais só funcionam em build nativo (iOS/Android) via
Capacitor — no navegador, o scheduler não faz nada.
