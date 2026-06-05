/**
 * posts.js — conteúdo do blog (trilíngue: pt/en/es).
 * Cada post tem title/excerpt/body por idioma. body é HTML estático e confiável
 * (conteúdo próprio), renderizado via dangerouslySetInnerHTML nas páginas do blog.
 * Para publicar um novo artigo, adicione um objeto a POSTS.
 */
export const POSTS = [
  {
    slug: 'aquecimento-de-chip-sem-bloqueio',
    date: '2026-05-28',
    readMin: 6,
    cover: '🔥',
    tag: { pt: 'Operação', en: 'Operations', es: 'Operación' },
    title: {
      pt: 'Aquecimento de chip: como vender no WhatsApp sem tomar bloqueio',
      en: 'Number warming: how to sell on WhatsApp without getting banned',
      es: 'Calentamiento de chips: cómo vender por WhatsApp sin que te bloqueen',
    },
    excerpt: {
      pt: 'Chip novo disparando em massa é receita de banimento. Veja a curva de aquecimento que mantém seus números vivos.',
      en: 'A fresh number blasting messages is a recipe for a ban. Here is the warm-up curve that keeps your numbers alive.',
      es: 'Un chip nuevo enviando en masa es receta de baneo. Mira la curva de calentamiento que mantiene tus números vivos.',
    },
    body: {
      pt: `<p>Todo bloqueio de WhatsApp tem a mesma origem: um número se comporta como robô antes de parecer humano. O aquecimento existe para inverter essa ordem — primeiro humano, depois escala.</p>
<h2>A curva que funciona</h2>
<p>Nos primeiros dias, o volume importa menos que a <strong>reciprocidade</strong>: mensagens que recebem resposta valem muito mais do que disparos. Suba o volume devagar e sempre atrás de conversa real.</p>
<ul>
  <li><strong>Dias 1–3:</strong> 10 a 20 conversas por dia, todas com resposta humana.</li>
  <li><strong>Dias 4–7:</strong> 30 a 50 contatos, misturando texto, áudio e mídia.</li>
  <li><strong>Semana 2:</strong> 80 a 120, já com listas pequenas e segmentadas.</li>
  <li><strong>Semana 3+:</strong> escala plena, monitorando a taxa de bloqueio por número.</li>
</ul>
<h2>Sinais de saúde</h2>
<p>Acompanhe taxa de resposta, denúncias e quedas de conexão por instância. Quando um número começa a cair, recue o volume <em>antes</em> do banimento — não depois. É isso que o painel de saúde da Ruptur faz por você, número a número.</p>`,
      en: `<p>Every WhatsApp ban shares the same root cause: a number behaves like a robot before it ever looks human. Warming up exists to flip that order — human first, scale later.</p>
<h2>The curve that works</h2>
<p>In the early days, volume matters less than <strong>reciprocity</strong>: messages that get replies are worth far more than blasts. Raise volume slowly and always behind real conversation.</p>
<ul>
  <li><strong>Days 1–3:</strong> 10 to 20 conversations a day, all with a human reply.</li>
  <li><strong>Days 4–7:</strong> 30 to 50 contacts, mixing text, audio and media.</li>
  <li><strong>Week 2:</strong> 80 to 120, now with small, segmented lists.</li>
  <li><strong>Week 3+:</strong> full scale, monitoring the ban rate per number.</li>
</ul>
<h2>Health signals</h2>
<p>Track reply rate, reports and connection drops per instance. When a number starts to slip, pull volume back <em>before</em> the ban — not after. That is exactly what Ruptur's health panel does for you, number by number.</p>`,
      es: `<p>Todo bloqueo de WhatsApp tiene el mismo origen: un número se comporta como robot antes de parecer humano. El calentamiento existe para invertir ese orden — primero humano, después escala.</p>
<h2>La curva que funciona</h2>
<p>En los primeros días, el volumen importa menos que la <strong>reciprocidad</strong>: los mensajes que reciben respuesta valen mucho más que los envíos masivos. Sube el volumen despacio y siempre detrás de conversación real.</p>
<ul>
  <li><strong>Días 1–3:</strong> de 10 a 20 conversaciones por día, todas con respuesta humana.</li>
  <li><strong>Días 4–7:</strong> de 30 a 50 contactos, mezclando texto, audio y multimedia.</li>
  <li><strong>Semana 2:</strong> de 80 a 120, ya con listas pequeñas y segmentadas.</li>
  <li><strong>Semana 3+:</strong> escala plena, monitoreando la tasa de bloqueo por número.</li>
</ul>
<h2>Señales de salud</h2>
<p>Monitorea tasa de respuesta, denuncias y caídas de conexión por instancia. Cuando un número empieza a caer, reduce el volumen <em>antes</em> del bloqueo — no después. Eso es justo lo que hace el panel de salud de Ruptur por ti, número a número.</p>`,
    },
  },
  {
    slug: 'funil-de-vendas-no-whatsapp',
    date: '2026-05-22',
    readMin: 7,
    cover: '🎯',
    tag: { pt: 'Estratégia', en: 'Strategy', es: 'Estrategia' },
    title: {
      pt: 'O funil de vendas no WhatsApp em 4 etapas',
      en: 'The WhatsApp sales funnel in 4 stages',
      es: 'El embudo de ventas en WhatsApp en 4 etapas',
    },
    excerpt: {
      pt: 'Conversa não é funil. Veja como transformar mensagens soltas em um processo que prevê receita.',
      en: 'A chat is not a funnel. Here is how to turn scattered messages into a process that forecasts revenue.',
      es: 'Una charla no es un embudo. Mira cómo convertir mensajes sueltos en un proceso que prevé ingresos.',
    },
    body: {
      pt: `<p>Quem vende pelo WhatsApp costuma confundir volume de conversa com processo de venda. O resultado é receita imprevisível: um mês estoura, o outro seca. A saída é dar <strong>etapas</strong> à conversa.</p>
<h2>As 4 etapas</h2>
<ul>
  <li><strong>1. Conexão:</strong> número aquecido e primeiro contato com contexto, nunca "oi sumido".</li>
  <li><strong>2. Qualificação:</strong> uma pergunta que separa quem tem dor de quem só responde.</li>
  <li><strong>3. Oferta:</strong> proposta clara, com prazo e um único próximo passo.</li>
  <li><strong>4. Fechamento:</strong> link de pagamento na hora certa, sem fricção.</li>
</ul>
<h2>Por que isso prevê receita</h2>
<p>Quando cada lead tem uma etapa, você consegue contar: quantos entraram, quantos avançaram, quantos pagaram. Aí a pergunta deixa de ser "será que vende?" e vira "quantos preciso na etapa 2 para fechar X?". Previsibilidade nasce de etapas, não de esforço.</p>`,
      en: `<p>People who sell on WhatsApp often mistake conversation volume for a sales process. The result is unpredictable revenue: one month booms, the next dries up. The fix is to give the conversation <strong>stages</strong>.</p>
<h2>The 4 stages</h2>
<ul>
  <li><strong>1. Connection:</strong> a warmed-up number and a first contact with context, never a cold "hey".</li>
  <li><strong>2. Qualification:</strong> one question that separates those in pain from those who just reply.</li>
  <li><strong>3. Offer:</strong> a clear proposal, with a deadline and a single next step.</li>
  <li><strong>4. Close:</strong> a payment link at the right moment, with no friction.</li>
</ul>
<h2>Why this forecasts revenue</h2>
<p>When every lead has a stage, you can count: how many entered, how many advanced, how many paid. The question stops being "will it sell?" and becomes "how many do I need in stage 2 to close X?". Predictability comes from stages, not from effort.</p>`,
      es: `<p>Quienes venden por WhatsApp suelen confundir volumen de conversación con proceso de venta. El resultado es ingreso impredecible: un mes explota, el otro se seca. La salida es dar <strong>etapas</strong> a la conversación.</p>
<h2>Las 4 etapas</h2>
<ul>
  <li><strong>1. Conexión:</strong> número calentado y primer contacto con contexto, nunca un "hola" frío.</li>
  <li><strong>2. Calificación:</strong> una pregunta que separa a quien tiene dolor de quien solo responde.</li>
  <li><strong>3. Oferta:</strong> propuesta clara, con plazo y un único próximo paso.</li>
  <li><strong>4. Cierre:</strong> link de pago en el momento justo, sin fricción.</li>
</ul>
<h2>Por qué esto prevé ingresos</h2>
<p>Cuando cada lead tiene una etapa, puedes contar: cuántos entraron, cuántos avanzaron, cuántos pagaron. La pregunta deja de ser "¿venderá?" y pasa a ser "¿cuántos necesito en la etapa 2 para cerrar X?". La previsibilidad nace de las etapas, no del esfuerzo.</p>`,
    },
  },
  {
    slug: 'metricas-que-importam-no-whatsapp',
    date: '2026-05-15',
    readMin: 5,
    cover: '📊',
    tag: { pt: 'Dados', en: 'Data', es: 'Datos' },
    title: {
      pt: 'As 5 métricas que importam quando você vende pelo WhatsApp',
      en: 'The 5 metrics that matter when you sell on WhatsApp',
      es: 'Las 5 métricas que importan cuando vendes por WhatsApp',
    },
    excerpt: {
      pt: 'Curtir mensagem não paga conta. Estas são as métricas que dizem se sua operação está saudável.',
      en: 'A "seen" message does not pay the bills. These are the metrics that tell whether your operation is healthy.',
      es: 'Un mensaje "visto" no paga cuentas. Estas son las métricas que dicen si tu operación está sana.',
    },
    body: {
      pt: `<p>Sem dados, vender pelo WhatsApp vira aposta. Mas medir tudo é o mesmo que não medir nada. Estas cinco métricas concentram quase toda a decisão útil.</p>
<ul>
  <li><strong>Taxa de resposta:</strong> de cada 100 mensagens, quantas voltam? Abaixo de 20% costuma ser problema de lista ou de chip.</li>
  <li><strong>Tempo até a primeira resposta:</strong> velocidade fecha venda. Minutos importam.</li>
  <li><strong>Conversão por etapa:</strong> onde os leads travam? Aí está seu gargalo.</li>
  <li><strong>Saúde do número:</strong> denúncias e quedas antecipam bloqueio.</li>
  <li><strong>Receita por número:</strong> quanto cada instância realmente gera.</li>
</ul>
<h2>De métrica a ação</h2>
<p>Cada número acima deve disparar uma decisão: trocar a lista, acelerar a resposta, reforçar uma etapa, recuar volume. Métrica que não muda comportamento é enfeite. O papel da Ruptur é transformar esses cinco números em ações antes de virarem prejuízo.</p>`,
      en: `<p>Without data, selling on WhatsApp is a gamble. But measuring everything is the same as measuring nothing. These five metrics hold almost every useful decision.</p>
<ul>
  <li><strong>Reply rate:</strong> out of every 100 messages, how many come back? Below 20% usually means a list or number problem.</li>
  <li><strong>Time to first reply:</strong> speed closes deals. Minutes matter.</li>
  <li><strong>Conversion per stage:</strong> where do leads stall? That is your bottleneck.</li>
  <li><strong>Number health:</strong> reports and drops predict bans.</li>
  <li><strong>Revenue per number:</strong> how much each instance actually generates.</li>
</ul>
<h2>From metric to action</h2>
<p>Each number above should trigger a decision: swap the list, speed up replies, reinforce a stage, pull volume back. A metric that does not change behavior is decoration. Ruptur's job is to turn these five numbers into actions before they turn into losses.</p>`,
      es: `<p>Sin datos, vender por WhatsApp es una apuesta. Pero medir todo es lo mismo que no medir nada. Estas cinco métricas concentran casi toda la decisión útil.</p>
<ul>
  <li><strong>Tasa de respuesta:</strong> de cada 100 mensajes, ¿cuántos vuelven? Debajo del 20% suele ser problema de lista o de chip.</li>
  <li><strong>Tiempo hasta la primera respuesta:</strong> la velocidad cierra ventas. Los minutos importan.</li>
  <li><strong>Conversión por etapa:</strong> ¿dónde se traban los leads? Ahí está tu cuello de botella.</li>
  <li><strong>Salud del número:</strong> denuncias y caídas anticipan el bloqueo.</li>
  <li><strong>Ingreso por número:</strong> cuánto genera realmente cada instancia.</li>
</ul>
<h2>De métrica a acción</h2>
<p>Cada número de arriba debe disparar una decisión: cambiar la lista, acelerar la respuesta, reforzar una etapa, reducir volumen. Una métrica que no cambia el comportamiento es adorno. El papel de Ruptur es convertir esos cinco números en acciones antes de que se vuelvan pérdida.</p>`,
    },
  },
];

export function getPost(slug) {
  return POSTS.find((p) => p.slug === slug) || null;
}

export default POSTS;
