# Playbook Content Radar

MVP interno estilo “Tinder de conteúdo” para curadoria de ideias de LinkedIn da Playbook Lab.

## O que já tem

- Tela inicial para escolher: Victor, Fernando ou Felipe.
- Card visual inspirado no LinkedIn.
- Votos: Gostei, Talvez, Não gostei.
- Swipe no mobile/trackpad: direita = gostei, esquerda = não gostei.
- Não mostra novamente ideias que a pessoa já votou.
- Dashboard admin com votos de Victor e Fernando, score e status automático.
- Cadastro de novas referências.
- Exportação CSV para abrir no Google Sheets.
- Backup JSON.

## Como rodar

```bash
npm install
npm run dev
```

Depois abra o endereço que o Vite mostrar no terminal.

## Como usar

1. Entre como Felipe.
2. Vá em “Nova ideia”.
3. Cadastre o link do LinkedIn, tema, resumo, ângulo Playbook e categoria.
4. Victor/Fernando entram, escolhem o próprio nome e votam.
5. Felipe vê os resultados no Dashboard.
6. Em “Dados / Exportar”, exporte CSV para analisar no Google Sheets.

## Métricas de conteúdo

Felipe tem uma nova área em `/content-dashboard` com:

- 222 posts históricos reais de Fernando e Victor;
- filtros por pessoa, período, formato, tema e CTA;
- tendências mensais, comparação entre criadores e rankings;
- subtelas de LinkedIn, YouTube, posts, vídeos, contas, imports e configurações;
- fallback local quando o novo schema do Supabase ainda não foi publicado;
- migrations, importador, Edge Functions, API interna e Cron para operação automática.

Setup completo: [`docs/content-dashboard-setup.md`](docs/content-dashboard-setup.md).

Verificação rápida:

```bash
npm run build:snapshot
npm run test:run
npm run build
```
