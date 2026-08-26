// Configuração de perfis/curadores do radar.
//
// O Fernando foi removido do radar como perfil e curador. Em respeito à decisão
// do time, o perfil dele (tela de seleção, votação e presença no fluxo de
// curadoria) fica DESATIVADO — mas nada foi apagado: os posts históricos dele
// no dashboard de métricas e os dados no Supabase permanecem intactos.
//
// Para reativar o perfil do Fernando (voltar a tela de seleção, a votação com
// dois curadores e a regra de aprovação Victor + Fernando), basta trocar a flag
// abaixo para `true`. Todo o código do perfil continua no lugar, apenas oculto
// por esta flag.
export const FERNANDO_ATIVO = false;

// Curadores editoriais cujos votos decidem a aprovação de uma pauta.
// Com o Fernando desativado, a aprovação passa a depender apenas do Victor.
export const CURATORS = FERNANDO_ATIVO ? ['Victor', 'Fernando'] : ['Victor'];

// Membros do time exibidos em listas de responsáveis, workspace e afins.
export const TEAM_MEMBERS = FERNANDO_ATIVO
  ? ['Felipe', 'Victor', 'Fernando', 'Junior']
  : ['Felipe', 'Victor', 'Junior'];
