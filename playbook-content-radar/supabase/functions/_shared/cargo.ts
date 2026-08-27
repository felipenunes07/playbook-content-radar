// Espelho do ramo CARGO da regra dura do banco (icp_hard_verdict, migration de
// 17/08). Só o pedaço que decide sem depender de área nem de porte: cargo operacional
// sem nenhum marcador de liderança é rejeitado, ponto.
//
// Existe aqui em TS, e não só em SQL, por causa da ORDEM em que o dinheiro é gasto.
// O enriquecimento compra duas coisas por lead: o perfil e a empresa. O perfil é que
// diz o cargo de verdade; a empresa só serve para o porte. Quando o cargo já reprova
// pela regra dura, o porte não muda nada — comprar a empresa é jogar crédito fora, e
// a chamada de LLM depois também, porque o cron da regra dura sobrescreveria o
// veredito do modelo em até 10 minutos.
//
// Medido no banco em 27/08/2026: 543 dos 2.715 leads descartados (20%) caem aqui —
// 543 raspagens de empresa e 543 chamadas de LLM que não mudaram veredito nenhum.
//
// NÃO vale usar isto antes do perfil, com o headline: o headline do LinkedIn é
// slogan, não cargo. Dos aprovados, 9 têm headline que reprovaria ("Inside Sales",
// "Business Analyst", "Designer | Data Analyst") e cargo real de Sales Manager,
// Co-Founder e Fundador. Por isso o corte fica DEPOIS do perfil.
const CARGO_LIDERANCA = [
  /(^|[^\p{L}\p{N}])(ceo|cto|cfo|coo|cmo|cro|cso|vp)([^\p{L}\p{N}]|$)/iu,
  /(^|[^\p{L}\p{N}])(founder|co-?founder|fundador|cofundador|chief|presidente|vice-presidente|diretor|director|gerente|superintendente|propriet[áa]ri)/iu,
  /(^|[^\p{L}\p{N}])(s[óo]ci[oa]|head)([^\p{L}\p{N}]|$)/iu,
];
const CARGO_MANAGER = /(^|[^\p{L}\p{N}])manager([^\p{L}\p{N}]|$)/iu;
const CARGO_MANAGER_NAO_LIDERA = /(account|product|project|community|social media|office|program) manager/iu;
const CARGO_BARRADO = /(^|[^\p{L}\p{N}])(estagi[áa]ri|estudante|trainee|aprendiz|assistente|auxiliar|analista|sdr|bdr|sales development|business development representative|pr[ée]-vend|pre-vend|inside sales|closer|social seller|recepcion)/iu;
// Faixa cinzenta: coordenação/supervisão/liderança de time não é cargo alto pela
// regra do Victor, mas também não é operacional puro. Quem decide é o modelo.
const CARGO_AMBIGUO = /(^|[^\p{L}\p{N}])(coordenador|coordenadora|supervisor|supervisora|l[íi]der|lead)([^\p{L}\p{N}]|$)/iu;

function temLideranca(titulo: string): boolean {
  if (CARGO_LIDERANCA.some((regex) => regex.test(titulo))) return true;
  return CARGO_MANAGER.test(titulo) && !CARGO_MANAGER_NAO_LIDERA.test(titulo);
}

/** O cargo sozinho já reprova pela regra dura? Só true quando não há dúvida. */
export function cargoJaReprova(jobTitle: string | null, headline: string | null): boolean {
  const titulo = String(jobTitle || headline || '').toLowerCase().trim();
  if (!titulo) return false;
  const lidera = temLideranca(titulo);
  if (CARGO_AMBIGUO.test(titulo) && !lidera) return false;
  return CARGO_BARRADO.test(titulo) && !lidera;
}
