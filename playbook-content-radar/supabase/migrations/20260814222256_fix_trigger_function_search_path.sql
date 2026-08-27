-- Advisor "function_search_path_mutable" (WARN): sem search_path fixo, os nomes no
-- corpo da função são resolvidos pelo search_path de quem dispara o trigger, o que
-- permite sequestrar uma referência plantando um objeto homônimo num schema à
-- frente do public.
--
-- As duas funções só fazem `new.updated_at = now(); return new;` e não referenciam
-- tabela, tipo nem operador de schema nenhum, então search_path vazio é seguro:
-- now() vem de pg_catalog, que é implícito e não removível.
alter function public.set_notion_content_items_updated_at() set search_path = '';
alter function public.set_content_production_items_updated_at() set search_path = '';

-- Validado em 14/08/2026: UPDATE no-op em uma linha de cada tabela e confirmação de
-- que updated_at avançou nas duas — os triggers seguem disparando.
