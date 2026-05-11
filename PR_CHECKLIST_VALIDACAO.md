# Validação manual pré-merge

Checklist solicitado e validado manualmente (sem refatoração ampla):

1. [x] Widgets continuam com mesmo design/textos.
2. [x] Tela principal mantém o mesmo volume de informação.
3. [x] APIs de now playing/recentes permanecem ativas como fallback.
4. [x] Fallback fixo do Peter não foi alterado.
5. [x] Prewarm está limitado e não agressivo.
6. [x] Runtime e JSONs continuam legíveis quando campos novos estiverem ausentes.

## Evidências rápidas (código)

- Design/textos preservados: títulos e ações de UI permanecem com as mesmas strings e estrutura de renderização.
- Volume de informação preservado: dashboard continua montando os mesmos blocos (ranking de faixa/álbum/artistas + histórico).
- Fallback de APIs ativos: uso de `users/{id}/streams/recent?limit=50` para recents e fallback de track atual via recente + enriquecimento por runtime.
- Peter fixo preservado: `PETER_AVATAR_FALLBACK` e regra `withPeterFallback` para `peter/12182998998/pedro`.
- Prewarm limitado: limite de até 5 faixas recentes e execução assíncrona com `Promise.allSettled`.
- Robustez para campos ausentes: uso extensivo de optional chaining, defaults e `safeParse`/cache tolerante.
