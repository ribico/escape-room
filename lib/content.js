'use strict';
// Contenuti del gioco: storia (giallo), livelli, scheda personale e generazione degli indovinelli.
// Tutti i testi sono originali, scritti per questa festa. I segnaposto {victim}, {name}, {age},
// {foods} vengono sostituiti dal server con i dati di config.json e delle schede compilate.

const STORY = {
  title: 'QUALCUNO HA AVVELENATO {victim}',
  intro: [
    'Ore 21:04. Cena di compleanno di {victim}.',
    'A metà della cena {victim} impallidisce, si regge al tavolo e cade a terra.',
    'Sullo schermo compare un messaggio anonimo: "Il veleno era nel cibo. Uno dei piatti di stasera."',
    'Stasera in tavola c\'erano: {foods}.',
    '"L\'antidoto esiste. È in questa casa, chiuso nella cassetta dei farmaci. Avete 60 minuti."',
    '"Firmato: IL CUOCO."',
    'Ogni telefono è ora uno strumento dell\'indagine. Inquadrate il QR e non perdete un secondo.'
  ],
  win: [
    'L\'ANTIDOTO FUNZIONA.',
    '{victim} apre gli occhi. "...avete impiegato {time}. Un po\' lente, ma vi voglio bene."',
    'Il Cuoco confessa: nel piatto c\'era solo un sonnifero. Voleva vedere se le amiche di {victim} sapevano collaborare.',
    'BUON COMPLEANNO {victim}!'
  ],
  dead: [
    'TROPPO TARDI.',
    'Il tempo è scaduto. {victim} non si muove più...',
    '...poi apre un occhio. "Era un sonnifero. Ma il Cuoco vi concede ancora qualche minuto: chiedete alla regia."'
  ]
};

// Scheda riservata che ogni giocatrice compila sul proprio telefono in lobby.
// Le risposte le vede solo la regia; il gioco le usa per costruire gli indovinelli dell'interrogatorio.
const PROFILE_FIELDS = [
  { key: 'nickname', label: 'Come ti chiamano le amiche (soprannome)?', placeholder: 'es. Giuly', required: false },
  { key: 'food', label: 'Cosa hai mangiato o portato stasera?', placeholder: 'es. la pizza ai quattro formaggi', required: true },
  { key: 'passion', label: 'La tua passione o il tuo talento', placeholder: 'es. pallavolo, disegno, cantare sotto la doccia', required: true },
  { key: 'met', label: 'Come e quando hai conosciuto {victim}?', placeholder: 'es. compagne di banco in prima media', required: true },
  { key: 'secret', label: 'Un dettaglio buffo su di te che le altre forse non sanno', placeholder: 'es. ho paura dei piccioni', required: true },
  { key: 'closest', label: 'Con chi, tra le presenti, hai il legame più stretto?', placeholder: 'es. Sofia, siamo cugine', required: false },
  { key: 'alibi', label: 'Dov\'eri quando {victim} si è sentita male? (inventa un alibi)', placeholder: 'es. in bagno a rifarmi il trucco', required: false }
];

// Ordine dei livelli. Ogni livello ha titolo, sottotitolo (istruzioni per lo schermo) e suggerimenti.
const LEVELS = [
  {
    id: 'sync',
    title: 'ATTO 1 · STABILIZZARE IL BATTITO',
    subtitle: 'Il cuore di {victim} è in aritmia. Per stabilizzarlo TUTTE dovete tenere il dito premuto sul telefono, nello stesso momento, per 3 secondi. Se una molla, si ricomincia.',
    hints: ['Contate insieme ad alta voce: "tre, due, uno... PREMI!"', 'Chi si stacca fa ripartire il conteggio: guardate lo schermo per capire chi manca.']
  },
  {
    id: 'fragments',
    title: 'ATTO 2 · IL BIGLIETTO STRAPPATO',
    subtitle: 'Il Cuoco ha lasciato un biglietto, strappato a strisce e sparso tra i telefoni. Ogni squadra ricompone la sua parola mettendo i telefoni fianco a fianco nell\'ordine giusto. Le parole, in ordine NEON → CYBER → PIXEL, formano la frase.',
    hints: ['Tenete i telefoni in verticale, fianco a fianco: le linee colorate devono continuare da un telefono all\'altro.', 'La frase è formata da tre parole, una per squadra, nell\'ordine delle squadre mostrato sullo schermo.']
  },
  {
    id: 'riddles',
    title: 'ATTO 3 · L\'INTERROGATORIO',
    subtitle: 'Tutte le presenti sono sospettate. Ognuna riceve sul telefono il fascicolo di una sospettata, senza nome: deve capire CHI è. Ogni identificazione corretta svela lettere della parola d\'ordine.',
    hints: ['Le lettere sullo schermo vanno lette in ordine da sinistra a destra.', 'Se non capite chi è, leggete il fascicolo ad alta voce: qualcuna si tradirà.', 'La parola d\'ordine è una sola parola, molto adatta a questa serata.']
  },
  {
    id: 'lights',
    title: 'ATTO 4 · IL QUADRO ELETTRICO',
    subtitle: 'Il Cuoco ha staccato la corrente della farmacia di casa. Ogni telefono controlla un interruttore: premendo, cambia stato insieme a quelli vicini (sopra, sotto, destra, sinistra). Accendete TUTTO.',
    hints: ['Premere due volte lo stesso interruttore lo riporta com\'era: ogni interruttore va premuto al massimo una volta.', 'Nominate una "capo elettricista" che guarda lo schermo e dice chi deve premere.', 'Partite dagli interruttori spenti in alto: per accenderli serve premere quello stesso o uno vicino.']
  },
  {
    id: 'qrhunt',
    title: 'ATTO 5 · LE TRE FIALE',
    subtitle: 'L\'antidoto è in tre fiale nascoste in casa, ognuna con un\'etichetta (QR). Trovatele e inquadratele con la fotocamera. Chi trova una fiala scopre una cifra della cassetta dei farmaci: NON dimenticatela!',
    hints: ['Prima fiala: dove si conservano le cose fredde.', 'Seconda fiala: sotto qualcosa su cui ci si siede.', 'Terza fiala: dove ci si guarda ogni mattina.']
  },
  {
    id: 'reconnect',
    title: 'ATTO 6 · LE PROVE SPARISCONO',
    subtitle: 'Il Cuoco sta cancellando le prove! Ognuna deve fotografare la prova sullo schermo inquadrando il QR con la fotocamera, prima che venga sostituita. Attenzione: cambia ogni 25 secondi.',
    hints: ['Fate la fila davanti allo schermo: una alla volta, veloci!', 'Se la fotocamera non legge il QR, digitate il codice scritto sotto al QR nella app.']
  },
  {
    id: 'simon',
    title: 'ATTO 7 · LA FORMULA DELL\'ANTIDOTO',
    subtitle: 'Lo schermo mostra la sequenza dei reagenti (i colori delle squadre). Ripetetela premendo il vostro pulsante nell\'ordine giusto. Tre dosi, sempre più lunghe. Un errore e la dose va rifatta.',
    hints: ['Ogni squadra ha un colore: quando appare il vostro, UNA sola di voi preme.', 'Scrivete la sequenza su un foglio mentre la guardate.']
  },
  {
    id: 'vault',
    title: 'ATTO FINALE · LA CASSETTA DEI FARMACI',
    subtitle: 'Il codice è formato dalle tre cifre delle fiale, in ordine: fiala 1, fiala 2, fiala 3. La serratura si blocca ogni 20 secondi: TUTTE dovete inserire il codice giusto entro 20 secondi dalla prima.',
    hints: ['Chi ha trovato le fiale deve dire la propria cifra a tutte.', 'Scrivete il codice su tutti i telefoni PRIMA di premere OK, poi confermate insieme.']
  }
];

// Parola d'ordine dell'interrogatorio: le lettere si svelano man mano che le sospettate vengono identificate.
const RIDDLE_PASSWORD = 'CONTROVELENO';

// Parole del biglietto strappato: una per squadra, nell'ordine delle squadre.
const FRAGMENT_WORDS = ['CERCA', 'TRE', 'FIALE', 'SUBITO'];

// Costruisce il "fascicolo" di una sospettata a partire dalla sua scheda (senza rivelarne il nome).
function dossier(player, profile, extra) {
  const p = profile || {};
  const lines = [];
  if (p.food) lines.push(`Stasera ha mangiato o portato: ${p.food}.`);
  if (p.passion) lines.push(`Passione o talento: ${p.passion}.`);
  if (p.met) lines.push(`Ha conosciuto ${extra.victim} così: ${p.met}.`);
  if (p.secret) lines.push(`Dettaglio che poche sanno: ${p.secret}.`);
  if (p.closest) lines.push(`Legame più stretto tra le presenti: ${p.closest}.`);
  if (p.alibi) lines.push(`Alibi dichiarato: "${p.alibi}".`);
  if (!lines.length) lines.push(`Non ha compilato la scheda: sospetto. Fa parte della squadra ${extra.team} ed è entrata nel sistema come numero ${extra.order}.`);
  return `FASCICOLO SOSPETTATA · ${lines.join(' ')} Chi è?`;
}

module.exports = { STORY, LEVELS, PROFILE_FIELDS, RIDDLE_PASSWORD, FRAGMENT_WORDS, dossier };
