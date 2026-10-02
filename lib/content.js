'use strict';
// Contenuti del gioco, bilingui (it/en). Ogni testo è { it, en }; il server sceglie la lingua
// della giocatrice (scelta alla registrazione) o quella dello schermo (config.screenLang).
// Segnaposto: {victim}, {name}, {age}, {foods}, {time}. Tutti i testi sono originali.
const L = (it, en) => ({ it, en });

const STORY = {
  title: L('QUALCUNO HA AVVELENATO {victim}', 'SOMEONE HAS POISONED {victim}'),
  intro: [
    L('Ore 21:04. Cena di compleanno di {victim}.', '9:04 pm. {victim}\'s birthday dinner.'),
    L('A metà della cena {victim} impallidisce, si regge al tavolo e cade a terra.', 'Halfway through dinner {victim} turns pale, grabs the table and falls to the floor.'),
    L('Sullo schermo compare un messaggio anonimo: "Il veleno era nel cibo. Uno dei piatti di stasera."', 'An anonymous message appears on the screen: "The poison was in the food. One of tonight\'s dishes."'),
    L('Stasera in tavola c\'erano: {foods}.', 'On the table tonight: {foods}.'),
    L('"L\'antidoto esiste. È in questa casa, chiuso nella cassetta dei farmaci. Avete 60 minuti."', '"The antidote exists. It is in this house, locked in the medicine box. You have 60 minutes."'),
    L('"Firmato: IL CUOCO."', '"Signed: THE COOK."'),
    L('Ogni telefono è ora uno strumento dell\'indagine. Inquadrate il QR e non perdete un secondo.', 'Every phone is now an investigation tool. Scan the QR and don\'t waste a second.')
  ],
  win: [
    L('L\'ANTIDOTO FUNZIONA.', 'THE ANTIDOTE WORKS.'),
    L('{victim} apre gli occhi. "...avete impiegato {time}. Un po\' lente, ma vi voglio bene."', '{victim} opens her eyes. "...it took you {time}. A bit slow, but I love you all."'),
    L('Il Cuoco confessa: nel piatto c\'era solo un sonnifero. Voleva vedere se le amiche di {victim} sapevano collaborare.', 'The Cook confesses: it was only a sleeping pill. He wanted to see whether {victim}\'s friends could work together.'),
    L('BUON COMPLEANNO {victim}!', 'HAPPY BIRTHDAY {victim}!')
  ],
  dead: [
    L('TROPPO TARDI.', 'TOO LATE.'),
    L('Il tempo è scaduto. {victim} non si muove più...', 'Time is up. {victim} is not moving anymore...'),
    L('...poi apre un occhio. "Era un sonnifero. Ma il Cuoco vi concede ancora qualche minuto: chiedete alla regia."', '...then she opens one eye. "It was a sleeping pill. But the Cook grants you a few more minutes: ask the game master."')
  ]
};

// Scheda riservata compilata sul telefono in lobby (la vede solo la regia).
const PROFILE_FIELDS = [
  { key: 'nickname', label: L('Come ti chiamano le amiche (soprannome)?', 'What do your friends call you (nickname)?'), placeholder: L('es. Giuly', 'e.g. Giuly'), required: false },
  { key: 'food', label: L('Cosa hai mangiato o portato stasera?', 'What did you eat or bring tonight?'), placeholder: L('es. la pizza ai quattro formaggi', 'e.g. the four-cheese pizza'), required: true },
  { key: 'passion', label: L('La tua passione o il tuo talento', 'Your passion or talent'), placeholder: L('es. pallavolo, disegno, cantare sotto la doccia', 'e.g. volleyball, drawing, singing in the shower'), required: true },
  { key: 'met', label: L('Come e quando hai conosciuto {victim}?', 'How and when did you meet {victim}?'), placeholder: L('es. compagne di banco in prima media', 'e.g. desk mates in sixth grade'), required: true },
  { key: 'secret', label: L('Un dettaglio buffo su di te che le altre forse non sanno', 'A funny detail about you the others may not know'), placeholder: L('es. ho paura dei piccioni', 'e.g. I am scared of pigeons'), required: true },
  { key: 'closest', label: L('Con chi, tra le presenti, hai il legame più stretto?', 'Who, among those here tonight, are you closest to?'), placeholder: L('es. Sofia, siamo cugine', 'e.g. Sofia, we are cousins'), required: false },
  { key: 'alibi', label: L('Dov\'eri quando {victim} si è sentita male? (inventa un alibi)', 'Where were you when {victim} fell ill? (make up an alibi)'), placeholder: L('es. in bagno a rifarmi il trucco', 'e.g. in the bathroom fixing my make-up'), required: false }
];

// Atti, in ordine. hints: suggerimenti che la regia può inviare.
const LEVELS = [
  { id: 'sync', title: L('ATTO 1 · STABILIZZARE IL BATTITO', 'ACT 1 · STEADY THE HEARTBEAT'),
    subtitle: L('Il cuore di {victim} è in aritmia. Per stabilizzarlo TUTTE dovete tenere il dito premuto sul telefono, nello stesso momento, per 3 secondi. Se una molla, si ricomincia.', '{victim}\'s heart is out of rhythm. To steady it, ALL of you must hold a finger on your phone at the same time for 3 seconds. If one lets go, it starts over.'),
    hints: [L('Contate insieme ad alta voce: "tre, due, uno... PREMI!"', 'Count out loud together: "three, two, one... PRESS!"'), L('Chi si stacca fa ripartire il conteggio: guardate lo schermo per capire chi manca.', 'Whoever lets go restarts the count: look at the screen to see who is missing.')] },
  { id: 'fragments', title: L('ATTO 2 · IL BIGLIETTO STRAPPATO', 'ACT 2 · THE TORN NOTE'),
    subtitle: L('Il Cuoco ha lasciato un biglietto, strappato a strisce e sparso tra i telefoni. Ogni squadra ricompone la sua parola mettendo i telefoni fianco a fianco nell\'ordine giusto. Le parole, in ordine NEON → CYBER → PIXEL, formano la frase.', 'The Cook left a note, torn into strips and scattered across the phones. Each team rebuilds its word by placing the phones side by side in the right order. The words, in the order NEON → CYBER → PIXEL, form the sentence.'),
    hints: [L('Tenete i telefoni in verticale, fianco a fianco: le linee colorate devono continuare da un telefono all\'altro.', 'Hold the phones upright, side by side: the coloured lines must continue from one phone to the next.'), L('La frase è formata da tre parole, una per squadra, nell\'ordine delle squadre mostrato sullo schermo.', 'The sentence has three words, one per team, in the team order shown on the screen.')] },
  { id: 'cipher', title: L('ATTO 3 · IL MESSAGGIO CIFRATO', 'ACT 3 · THE CODED MESSAGE'),
    subtitle: L('Sullo schermo c\'è un messaggio del Cuoco scritto a simboli. La chiave è divisa tra i vostri telefoni: ognuna ne conosce un pezzo. Mettete insieme i pezzi e scrivete la parola.', 'On the screen is a message from the Cook written in symbols. The key is split across your phones: each of you knows a piece. Put the pieces together and type the word.'),
    hints: [L('Leggete ad alta voce i vostri simboli: "stella uguale B". Qualcuna scriva tutto su un foglio.', 'Read your symbols out loud: "star equals B". Someone write everything on paper.'), L('È il nome di una pianta velenosa.', 'It is the name of a poisonous plant.')] },
  { id: 'riddles', title: L('ATTO 4 · L\'INTERROGATORIO', 'ACT 4 · THE INTERROGATION'),
    subtitle: L('Tutte le presenti sono sospettate. Ognuna riceve sul telefono il fascicolo di una sospettata, senza nome: deve capire CHI è. Ogni identificazione corretta svela lettere della parola d\'ordine.', 'Everyone here is a suspect. Each of you receives the file of one suspect on your phone, with no name: work out WHO she is. Every correct identification reveals letters of the password.'),
    hints: [L('Le lettere sullo schermo vanno lette in ordine da sinistra a destra.', 'Read the letters on the screen in order, left to right.'), L('Se non capite chi è, leggete il fascicolo ad alta voce: qualcuna si tradirà.', 'If you cannot tell who it is, read the file out loud: someone will give herself away.'), L('La parola d\'ordine è una sola parola italiana, molto adatta a questa serata.', 'The password is a single Italian word, very fitting for tonight.')] },
  { id: 'seating', title: L('ATTO 5 · CHI SEDEVA DOVE', 'ACT 5 · WHO SAT WHERE'),
    subtitle: L('Il veleno è stato versato da chi sedeva accanto a {victim}. Il Cuoco ha mescolato i posti a tavola: ognuna ha un indizio diverso sul telefono. Ricostruite l\'ordine dei cinque posti.', 'The poison was poured by whoever sat next to {victim}. The Cook shuffled the seats: each of you has a different clue on her phone. Rebuild the order of the five seats.'),
    hints: [L('Leggete tutti gli indizi ad alta voce, uno alla volta, e disegnate i cinque posti su un foglio.', 'Read all the clues out loud, one at a time, and draw the five seats on paper.'), L('Partite dall\'indizio che dice un posto preciso, poi aggiungete gli altri.', 'Start from the clue that names an exact seat, then add the others.')] },
  { id: 'lights', title: L('ATTO 6 · IL QUADRO ELETTRICO', 'ACT 6 · THE FUSE BOX'),
    subtitle: L('Il Cuoco ha staccato la corrente della farmacia di casa. Ogni telefono controlla un interruttore: premendo, cambia stato insieme a quelli vicini (sopra, sotto, destra, sinistra). Accendete TUTTO.', 'The Cook cut the power to the home pharmacy. Each phone controls one switch: pressing it flips it together with its neighbours (above, below, left, right). Turn EVERYTHING on.'),
    hints: [L('Premere due volte lo stesso interruttore lo riporta com\'era: ogni interruttore va premuto al massimo una volta.', 'Pressing the same switch twice puts it back: each switch should be pressed at most once.'), L('Nominate una "capo elettricista" che guarda lo schermo e dice chi deve premere.', 'Appoint a "chief electrician" who watches the screen and says who should press.'), L('Partite dagli interruttori spenti in alto: per accenderli serve premere quello stesso o uno vicino.', 'Start from the switches that are off in the top row: to turn them on you must press that switch or a neighbour.')] },
  { id: 'qrhunt', title: L('ATTO 7 · LE TRE FIALE', 'ACT 7 · THE THREE VIALS'),
    subtitle: L('L\'antidoto è in tre fiale nascoste in casa, ognuna con un\'etichetta (QR). Trovatele e inquadratele con la fotocamera. Chi trova una fiala scopre una cifra della cassetta dei farmaci: NON dimenticatela!', 'The antidote is in three vials hidden in the house, each with a label (QR). Find them and scan them with the camera. Whoever finds a vial learns one digit of the medicine box code: DO NOT forget it!'),
    hints: [L('Prima fiala: dove si conservano le cose fredde.', 'First vial: where cold things are kept.'), L('Seconda fiala: sotto qualcosa su cui ci si siede.', 'Second vial: under something you sit on.'), L('Terza fiala: dove ci si guarda ogni mattina.', 'Third vial: where you look at yourself every morning.')] },
  { id: 'reconnect', title: L('ATTO 8 · LE PROVE SPARISCONO', 'ACT 8 · THE EVIDENCE VANISHES'),
    subtitle: L('Il Cuoco sta cancellando le prove! Ognuna deve fotografare la prova sullo schermo inquadrando il QR con la fotocamera, prima che venga sostituita. Attenzione: cambia ogni 25 secondi.', 'The Cook is deleting the evidence! Each of you must photograph the evidence on the screen by scanning the QR with the camera before it is replaced. Careful: it changes every 25 seconds.'),
    hints: [L('Fate la fila davanti allo schermo: una alla volta, veloci!', 'Line up in front of the screen: one at a time, quick!'), L('Se la fotocamera non legge il QR, digitate il codice scritto sotto al QR nella app.', 'If the camera cannot read the QR, type the code shown under the QR into the app.')] },
  { id: 'simon', title: L('ATTO 9 · LA FORMULA DELL\'ANTIDOTO', 'ACT 9 · THE ANTIDOTE FORMULA'),
    subtitle: L('Lo schermo mostra la sequenza dei reagenti (i colori delle squadre). Ripetetela premendo il vostro pulsante nell\'ordine giusto. Tre dosi, sempre più lunghe. Un errore e la dose va rifatta.', 'The screen shows the sequence of reagents (the team colours). Repeat it by pressing your button in the right order. Three doses, each longer. One mistake and the dose must be redone.'),
    hints: [L('Ogni squadra ha un colore: quando appare il vostro, UNA sola di voi preme.', 'Each team has a colour: when yours appears, only ONE of you presses.'), L('Scrivete la sequenza su un foglio mentre la guardate.', 'Write the sequence on paper while you watch it.')] },
  { id: 'rooms', title: L('ATTO 10 · LA STANZA GIUSTA', 'ACT 10 · THE RIGHT ROOM'),
    subtitle: L('La cassetta dei farmaci è in una stanza della casa. Ognuna ha sul telefono un indizio che esclude alcune stanze. Confrontatevi e votate TUTTE la stessa stanza: la porta si apre solo all\'unanimità.', 'The medicine box is in one room of the house. Each of you has a clue on her phone that rules out some rooms. Compare notes and ALL vote for the same room: the door opens only if you are unanimous.'),
    hints: [L('Leggete gli indizi ad alta voce e cancellate le stanze una per una.', 'Read the clues out loud and cross the rooms off one by one.'), L('Potete cambiare voto finché non avete votato tutte.', 'You can change your vote until everyone has voted.')] },
  { id: 'vault', title: L('ATTO FINALE · LA CASSETTA DEI FARMACI', 'FINAL ACT · THE MEDICINE BOX'),
    subtitle: L('Il codice è formato dalle tre cifre delle fiale, in ordine: fiala 1, fiala 2, fiala 3. La serratura si blocca ogni 20 secondi: TUTTE dovete inserire il codice giusto entro 20 secondi dalla prima.', 'The code is the three vial digits, in order: vial 1, vial 2, vial 3. The lock resets every 20 seconds: ALL of you must enter the right code within 20 seconds of the first.'),
    hints: [L('Chi ha trovato le fiale deve dire la propria cifra a tutte.', 'Whoever found a vial must tell her digit to everyone.'), L('Scrivete il codice su tutti i telefoni PRIMA di premere OK, poi confermate insieme.', 'Type the code on every phone BEFORE pressing OK, then confirm together.')] }
];

const RIDDLE_PASSWORD = 'CONTROVELENO';       // parola d'ordine dell'interrogatorio
const FRAGMENT_WORDS = ['CERCA', 'TRE', 'FIALE', 'SUBITO']; // biglietto strappato, una parola per squadra
const CIPHER_WORD = 'BELLADONNA';             // messaggio cifrato (nome di una pianta velenosa, uguale in it/en)
const CIPHER_SYMBOLS = ['★', '◆', '●', '▲', '♠', '♣', '♥', '♦', '☾', '☀', '⚡', '✚', '❄', '✿', '☂', '⚓', '☎', '✈', '♫', '☕'];

// Stanze per l'atto "La stanza giusta", con attributi usati per generare gli indizi.
const ROOMS = [
  { id: 'kitchen', name: L('Cucina', 'Kitchen'), floor: 0, windows: true, water: true, cold: false, sleep: false },
  { id: 'bathroom', name: L('Bagno', 'Bathroom'), floor: 1, windows: true, water: true, cold: false, sleep: false },
  { id: 'bedroom', name: L('Camera da letto', 'Bedroom'), floor: 1, windows: true, water: false, cold: false, sleep: true },
  { id: 'living', name: L('Salotto', 'Living room'), floor: 0, windows: true, water: false, cold: false, sleep: false },
  { id: 'garage', name: L('Garage', 'Garage'), floor: 0, windows: false, water: false, cold: true, sleep: false },
  { id: 'cellar', name: L('Cantina', 'Cellar'), floor: -1, windows: false, water: false, cold: true, sleep: false },
  { id: 'attic', name: L('Soffitta', 'Attic'), floor: 2, windows: true, water: false, cold: false, sleep: false },
  { id: 'guest', name: L('Camera degli ospiti', 'Guest room'), floor: 1, windows: false, water: false, cold: false, sleep: true }
];
// Ogni indizio è vero per le stanze che soddisfano `ok` e ne esclude le altre.
const ROOM_CLUES = [
  { ok: (r) => r.windows, text: L('La stanza ha almeno una finestra.', 'The room has at least one window.') },
  { ok: (r) => !r.windows, text: L('Nella stanza non entra mai la luce del sole.', 'Sunlight never enters the room.') },
  { ok: (r) => r.water, text: L('Nella stanza c\'è l\'acqua corrente.', 'The room has running water.') },
  { ok: (r) => !r.water, text: L('Nella stanza non c\'è nessun rubinetto.', 'There is no tap in the room.') },
  { ok: (r) => r.floor === 0, text: L('La stanza è al piano terra.', 'The room is on the ground floor.') },
  { ok: (r) => r.floor !== 0, text: L('Per arrivarci bisogna fare le scale.', 'You need to take the stairs to get there.') },
  { ok: (r) => r.floor > 0, text: L('La stanza è sopra il piano terra.', 'The room is above the ground floor.') },
  { ok: (r) => r.floor < 1, text: L('La stanza non è ai piani superiori.', 'The room is not on an upper floor.') },
  { ok: (r) => r.cold, text: L('D\'inverno nella stanza fa freddo.', 'The room is cold in winter.') },
  { ok: (r) => !r.cold, text: L('La stanza è riscaldata.', 'The room is heated.') },
  { ok: (r) => r.sleep, text: L('Nella stanza c\'è un letto.', 'There is a bed in the room.') },
  { ok: (r) => !r.sleep, text: L('Nella stanza nessuno dorme.', 'Nobody sleeps in the room.') }
];
// Modelli degli indizi per "Chi sedeva dove" (posti numerati 1-5 da sinistra).
const SEAT_CLUES = {
  exact: L('{a} sedeva al posto {k}.', '{a} sat in seat {k}.'),
  leftOf: L('{a} sedeva subito a sinistra di {b}.', '{a} sat immediately to the left of {b}.'),
  end: L('{a} sedeva a un\'estremità del tavolo.', '{a} sat at one end of the table.'),
  notEnd: L('{a} non sedeva a un\'estremità del tavolo.', '{a} did not sit at either end of the table.'),
  notNext: L('{a} e {b} non sedevano vicine.', '{a} and {b} were not sitting next to each other.'),
  somewhereLeft: L('{a} sedeva da qualche parte a sinistra di {b}.', '{a} sat somewhere to the left of {b}.'),
  between: L('Tra {a} e {b} c\'era esattamente una persona.', 'Exactly one person sat between {a} and {b}.')
};

// Scene animate sui telefoni (art = disegno in public/cine.js).
const SCENES = {
  prologue: [{ chat: [
    L('Buonasera. Vi state divertendo?', 'Good evening. Are you having fun?'),
    L('{victim} un po\' meno, direi.', '{victim} a little less, I would say.'),
    L('Il veleno era nel cibo. In uno dei piatti di stasera.', 'The poison was in the food. In one of tonight\'s dishes.'),
    L('L\'antidoto è in casa, nella cassetta dei farmaci. Avete 60 minuti.', 'The antidote is in the house, in the medicine box. You have 60 minutes.'),
    L('Ogni telefono è uno strumento. Usateli insieme... o non usateli affatto.', 'Every phone is a tool. Use them together... or not at all.'),
    L('— Il Cuoco', '— The Cook')
  ] }],
  sync: [
    { art: 'ecg', title: L('Battito irregolare', 'Irregular heartbeat'), text: L('Il cuore di {victim} sta perdendo il ritmo. Serve una scarica sincronizzata: tutte le dita, lo stesso istante.', '{victim}\'s heart is losing its rhythm. It needs a synchronised shock: every finger, the same instant.'), buzz: [100, 100, 100, 100, 100] },
    { art: 'flat', title: L('Come si fa', 'How it works'), text: L('Premi e TIENI il pulsante. Si carica solo se lo fate tutte insieme per 3 secondi. Se una molla, si riparte.', 'Press and HOLD the button. It only charges if you all do it together for 3 seconds. If one lets go, it starts over.') }
  ],
  fragments: [
    { art: 'paper', title: L('Un biglietto strappato', 'A torn note'), text: L('Il Cuoco ha lasciato un messaggio, ma l\'ha ridotto a strisce e le ha sparse tra i vostri telefoni.', 'The Cook left a message, but tore it into strips and scattered them across your phones.') },
    { art: 'paper', title: L('Come si fa', 'How it works'), text: L('Ogni squadra ha una parola. Mettete i telefoni fianco a fianco, in verticale: le linee colorate devono continuare da uno all\'altro.', 'Each team has one word. Put the phones side by side, upright: the coloured lines must continue from one phone to the next.') }
  ],
  cipher: [
    { art: 'cipher', title: L('Un messaggio a simboli', 'A message in symbols'), text: L('Il Cuoco scrive in codice. Ogni simbolo è una lettera, e la chiave è spezzettata tra i vostri telefoni.', 'The Cook writes in code. Each symbol is a letter, and the key is split across your phones.') },
    { art: 'cipher', title: L('Come si fa', 'How it works'), text: L('Guarda i tuoi simboli e dilli alle altre. Quando avete tutte le lettere, scrivete la parola.', 'Look at your symbols and tell the others. When you have all the letters, type the word.') }
  ],
  riddles: [
    { art: 'folder', title: L('Fascicoli riservati', 'Confidential files'), text: L('Tutte le presenti sono sospettate. Stai per ricevere il fascicolo di una di loro. Senza nome.', 'Everyone here is a suspect. You are about to receive the file of one of them. No name.'), buzz: [200] },
    { art: 'folder', title: L('Come si fa', 'How it works'), text: L('Leggi gli indizi e scrivi il nome (o il soprannome) della sospettata. Ogni identificazione svela lettere sullo schermo.', 'Read the clues and type the suspect\'s name (or nickname). Every identification reveals letters on the screen.') }
  ],
  seating: [
    { art: 'chairs', title: L('Chi sedeva dove', 'Who sat where'), text: L('Chi ha versato il veleno sedeva accanto a {victim}. Ma il Cuoco ha mescolato i posti a tavola.', 'Whoever poured the poison sat next to {victim}. But the Cook shuffled the seats at the table.') },
    { art: 'chairs', title: L('Come si fa', 'How it works'), text: L('Ognuna ha un indizio diverso. Leggeteli ad alta voce, ricostruite l\'ordine dei cinque posti e inseritelo su un telefono.', 'Each of you has a different clue. Read them out loud, rebuild the order of the five seats and enter it on one phone.') }
  ],
  lights: [
    { art: 'circuit', title: L('Blackout', 'Blackout'), text: L('Il Cuoco ha manomesso il quadro elettrico della farmacia di casa. Senza corrente, niente antidoto.', 'The Cook tampered with the fuse box of the home pharmacy. No power, no antidote.'), buzz: [80, 40, 80] },
    { art: 'circuit', title: L('Come si fa', 'How it works'), text: L('Controlli un interruttore. Premendolo cambia stato insieme ai vicini. Guardate lo schermo e decidete insieme chi preme.', 'You control one switch. Pressing it flips it together with its neighbours. Watch the screen and decide together who presses.') }
  ],
  qrhunt: [
    { art: 'vials', title: L('Tre fiale', 'Three vials'), text: L('L\'antidoto è diviso in tre fiale nascoste in casa. Ognuna ha un\'etichetta con un QR.', 'The antidote is split into three vials hidden in the house. Each has a label with a QR.') },
    { art: 'vials', title: L('Come si fa', 'How it works'), text: L('Alzatevi e cercate! Inquadrate l\'etichetta con la fotocamera: chi trova una fiala scopre una cifra del codice finale.', 'Get up and search! Scan the label with the camera: whoever finds a vial learns one digit of the final code.') }
  ],
  reconnect: [
    { art: 'camera', title: L('Le prove spariscono', 'The evidence vanishes'), text: L('Il Cuoco sta cancellando le prove dallo schermo, una dopo l\'altra.', 'The Cook is deleting the evidence from the screen, one piece after another.'), buzz: [300] },
    { art: 'camera', title: L('Come si fa', 'How it works'), text: L('Fotografa la prova inquadrando il QR sullo schermo con la fotocamera, prima che cambi. Tutte devono farlo.', 'Photograph the evidence by scanning the QR on the screen with your camera before it changes. Everyone must do it.') }
  ],
  simon: [
    { art: 'formula', title: L('La formula', 'The formula'), text: L('Le tre fiale vanno mescolate nell\'ordine giusto. Sbagliare l\'ordine rovina la dose.', 'The three vials must be mixed in the right order. The wrong order ruins the dose.') },
    { art: 'formula', title: L('Come si fa', 'How it works'), text: L('Guarda la sequenza di colori sullo schermo. Quando tocca al colore della tua squadra, UNA sola di voi preme.', 'Watch the colour sequence on the screen. When it is your team\'s colour, only ONE of you presses.') }
  ],
  rooms: [
    { art: 'map', title: L('La stanza giusta', 'The right room'), text: L('La cassetta dei farmaci è in una stanza della casa. Il Cuoco ha lasciato indizi... uno per ciascuna.', 'The medicine box is in one room of the house. The Cook left clues... one for each of you.') },
    { art: 'map', title: L('Come si fa', 'How it works'), text: L('Confrontate gli indizi, escludete le stanze e votate. La porta si apre solo se votate TUTTE la stessa stanza.', 'Compare the clues, rule out rooms and vote. The door opens only if you ALL vote for the same room.') }
  ],
  vault: [
    { art: 'lock', title: L('La cassetta dei farmaci', 'The medicine box'), text: L('Ultimo passo. Tre cifre, quelle delle fiale. La serratura si blocca ogni 20 secondi.', 'Last step. Three digits, the ones from the vials. The lock resets every 20 seconds.'), buzz: [100, 60, 100, 60, 300] },
    { art: 'lock', title: L('Come si fa', 'How it works'), text: L('Scrivi il codice sul tuo telefono, ma NON premere OK finché tutte sono pronte. Poi confermate insieme.', 'Type the code on your phone, but do NOT press OK until everyone is ready. Then confirm together.') }
  ],
  dead: [{ art: 'skull', title: L('Troppo tardi', 'Too late'), text: L('Il tempo è scaduto. {victim} non si muove più... Guardate lo schermo.', 'Time is up. {victim} is not moving anymore... Look at the screen.'), buzz: [600, 200, 600] }],
  hint: (text) => [{ chat: [L('Un aiutino. Ma non ditelo a nessuno.', 'A little help. But don\'t tell anyone.'), text] }]
};

// Fascicolo di una sospettata, costruito dalla sua scheda (senza nome). `t` traduce un testo bilingue.
function dossier(profile, extra, t) {
  const p = profile || {};
  const lines = [];
  if (p.food) lines.push(t(L(`Stasera ha mangiato o portato: ${p.food}.`, `Tonight she ate or brought: ${p.food}.`)));
  if (p.passion) lines.push(t(L(`Passione o talento: ${p.passion}.`, `Passion or talent: ${p.passion}.`)));
  if (p.met) lines.push(t(L(`Ha conosciuto ${extra.victim} così: ${p.met}.`, `How she met ${extra.victim}: ${p.met}.`)));
  if (p.secret) lines.push(t(L(`Dettaglio che poche sanno: ${p.secret}.`, `A detail few people know: ${p.secret}.`)));
  if (p.closest) lines.push(t(L(`Legame più stretto tra le presenti: ${p.closest}.`, `Closest to, among those here: ${p.closest}.`)));
  if (p.alibi) lines.push(t(L(`Alibi dichiarato: "${p.alibi}".`, `Declared alibi: "${p.alibi}".`)));
  if (!lines.length) lines.push(t(L(`Non ha compilato la scheda: sospetto. Fa parte della squadra ${extra.team} ed è entrata nel sistema come numero ${extra.order}.`, `She did not fill in her card: suspicious. She is in team ${extra.team} and entered the system as number ${extra.order}.`)));
  return t(L('FASCICOLO SOSPETTATA · ', 'SUSPECT FILE · ')) + lines.join(' ') + t(L(' Chi è?', ' Who is she?'));
}

// Testi delle pagine aperte dalla fotocamera (/k, /r).
const SCAN = {
  who: L('Chi sei?', 'Who are you?'),
  whoBody: L('Questo telefono non è ancora entrato nel gioco. Apri prima la pagina del gioco e inserisci il tuo nome.', 'This phone has not joined the game yet. Open the game page first and enter your name.'),
  early: L('Troppo presto!', 'Too early!'),
  earlyBody: L('Il Cuoco: "Hai trovato qualcosa... ma non è ancora il momento. Ricorda dove l\'hai visto."', 'The Cook: "You found something... but it is not time yet. Remember where you saw it."'),
  notNow: L('Non ora', 'Not now'),
  notNowBody: L('Non c\'è nulla da fotografare in questo momento.', 'There is nothing to photograph right now.'),
  vial: L('Fiala {n}', 'Vial {n}'),
  nothing: L('Niente', 'Nothing'),
  digit: L('La cifra di questa fiala è', 'The digit of this vial is'),
  remember: L('Ricordala e dilla a tutte!', 'Remember it and tell everyone!'),
  saved: L('Prova salvata!', 'Evidence saved!'),
  expired: L('Scaduto', 'Expired'),
  back: L('Torna alla scheda del gioco nel browser (questa pagina si può chiudere).', 'Go back to the game tab in your browser (you can close this page).'),
  unknownCode: L('Codice sconosciuto. Il Cuoco: "Bel tentativo."', 'Unknown code. The Cook: "Nice try."'),
  alreadyFound: L('Fiala {n} già trovata da {who}.', 'Vial {n} already found by {who}.'),
  found: L('Fiala {n} trovata!', 'Vial {n} found!'),
  tokenBad: L('Codice scaduto o errato: guarda il QR attuale sullo schermo.', 'Expired or wrong code: look at the current QR on the screen.')
};

module.exports = { L, STORY, LEVELS, PROFILE_FIELDS, RIDDLE_PASSWORD, FRAGMENT_WORDS, CIPHER_WORD, CIPHER_SYMBOLS, ROOMS, ROOM_CLUES, SEAT_CLUES, SCENES, SCAN, dossier };
