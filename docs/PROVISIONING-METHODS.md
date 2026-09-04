# Métodos de provisão mensal

O app calcula, para cada item ativo, quanto guardar por mês para a próxima
troca, e soma tudo em um único número: a mensalidade de reposição. Existe
mais de uma forma matematicamente válida de fazer essa divisão. Este
documento registra as opções consideradas e qual está implementada, para
facilitar trocar de método no futuro sem reabrir a discussão de design.

## Implementado: provisão por item (`per-item`)

`monthlyProvision(item) = (preçoProjetado × quantidade) ÷ mesesRestantes`

Cada item financia exatamente o que falta, no tempo que falta. A mensalidade
total é a soma das provisões de todos os itens ativos.

**Vantagens**
- Transparente: cada item mostra sua própria parcela: fácil de auditar.
- Sempre correto no sentido estrito — se você seguir o número, o dinheiro
  para aquela troca específica estará lá na data.
- Reage a mudanças (editar vida útil, registrar compra) de forma imediata e
  previsível.

**Desvantagem**
- O número **não é estável mês a mês**: como o denominador (meses
  restantes) encolhe com o tempo, a provisão de um item sobe conforme a
  data se aproxima, e cai de volta ao normal assim que a compra é
  registrada (o ciclo reinicia com meses restantes = vida útil cheia). Um
  item vencido ou a menos de um mês da troca provisiona o custo total
  naquele mês — um pico visível na mensalidade total.

## Alternativa não implementada: custo médio perpétuo (`perpetual-average`)

`monthlyProvision(item) = (preçoProjetado × quantidade) ÷ vidaÚtilTotalMeses`

Cada item financia sua própria reposição perpétua, dividindo pelo ciclo de
vida completo (não pelo tempo restante).

**Vantagens**
- Número estável: não oscila com a proximidade da data de troca.
- Mais parecido com uma "mensalidade de manutenção" fixa, fácil de
  incorporar num orçamento familiar recorrente.

**Desvantagem**
- **Subfinancia o curto prazo.** Um item comprado ontem com vida útil de 24
  meses provisiona o mesmo valor mensal que um item que vence em 2 meses —
  mas só o segundo caso tem urgência real de caixa. Se você cadastrar itens
  que já estão perto do fim da vida útil, o método perpétuo não vai ter
  acumulado o suficiente até a data de troca.

## Como trocar de método

`AppSettings.provisioningMethod` já existe no schema (`per-item` |
`perpetual-average`) para permitir a troca sem migração de dados. Para
ativar o método perpétuo:

1. Implementar `monthlyProvisionPerpetual(item, purchases, settings, today)`
   em `src/domain/calculations.ts`, usando `item.lifespanMonths` no lugar de
   `monthsBetween(today, targetDate)` como denominador.
2. Em `totalMonthly` (e em qualquer lugar que chame `monthlyProvision`),
   despachar pelo valor de `settings.provisioningMethod`.
3. Não é necessária migração de dados — `Purchase` e `Item` já têm tudo que
   os dois métodos precisam.
