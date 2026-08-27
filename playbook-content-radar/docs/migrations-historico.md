# Histórico de migrations — por que os timestamps não batem

Este projeto teve migrations aplicadas de duas formas: pelos arquivos desta pasta
(`supabase db push`) e ad-hoc, pelo MCP do Supabase / dashboard, que gera o próprio
número de versão na hora. O resultado é que a mesma mudança aparece duas vezes no
histórico com números diferentes — um do arquivo, outro da aplicação ad-hoc.

Em 27/08/2026, para conseguir aplicar as migrations do multi-ICP, o histórico foi
reconciliado:

1. As versões dos arquivos locais que já estavam no banco (conferidas uma a uma
   consultando as tabelas/colunas/funções que cada uma cria) foram marcadas como
   **applied** sem re-executar o SQL:

   ```
   20260712180000 20260712213000 20260712214225 20260712231415 20260712233000
   20260712233100 20260712233200 20260716120000 20260814180000 20260814210000
   20260814230000 20260815010000 20260815020000 20260817130000 20260817140000
   ```

2. As versões que existiam **só no remoto**, sem arquivo local — as aplicações
   ad-hoc das mesmas mudanças acima — foram marcadas como **reverted**, o que apaga
   a linha do histórico mas **não desfaz nada no banco**:

   ```
   20260708150000 20260814173814 20260814201303 20260814203949 20260815004050
   20260815155535 20260817130551 20260817135615 20260817135712 20260817140005
   20260817140052
   ```

   Ficam registradas aqui para não se perderem. O efeito delas no schema continua
   valendo; o que saiu foi só o número no ledger, substituído pelo do arquivo
   equivalente.

**Como evitar de novo:** aplicar mudança de schema sempre por arquivo nesta pasta e
`supabase db push`. Aplicar pelo MCP/dashboard cria uma versão que nenhum arquivo
explica, e o `db push` seguinte trava até alguém reconciliar de novo.
