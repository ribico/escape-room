# "Chi ha avvelenato Martina?" — escape room per la festa di compleanno

Escape room virtuale collaborativa in stile giallo per ~12 persone, pensata per durare circa un'ora.
Gira come web app su un PC nella rete Wi-Fi di casa: uno **schermo grande** mostra la storia
e lo stato dell'indagine, i **cellulari** delle giocatrici entrano inquadrando un QR code e
diventano i "terminali" con cui si risolvono le sfide. Nessuna app da installare, nessuna connessione a Internet necessaria.

## La storia

A metà della cena di compleanno **Martina** (la vittima, configurabile) si sente male e cade a terra.
Un messaggio anonimo firmato **"Il Cuoco"** annuncia che il veleno era in uno dei piatti della serata
e che l'antidoto è chiuso nella cassetta dei farmaci di casa. Ci sono 60 minuti: se il tempo scade,
lo schermo mostra "TROPPO TARDI" (con un colpo di scena rassicurante: era solo un sonnifero) e la regia
può concedere minuti extra per riprendere. Se vincono, l'antidoto funziona e parte la festa.

Il tono è "giallo da tavolo" (Cluedo), non horror: nessuna delle ragazze è il colpevole, il cattivo è un personaggio inventato.

## La scheda riservata (personalizzazione)

In lobby, dopo aver scritto il nome, ogni ragazza compila **sul proprio telefono** una scheda che
nessun'altra vede (solo la regia): soprannome, cosa ha mangiato o portato stasera, passione, come ha
conosciuto Martina, un dettaglio buffo, il legame più stretto tra le presenti, un alibi inventato.
Le domande si modificano in `lib/content.js` (`PROFILE_FIELDS`).

Il gioco usa le schede in due punti:
- nel prologo, l'elenco dei piatti "sospetti" è preso dalle risposte;
- nell'**Atto 3, l'interrogatorio**: ogni giocatrice riceve il "fascicolo" di una sospettata (mai il proprio),
  costruito dalla sua scheda ma senza nome, e deve capire chi è. Si accettano nome e soprannome.
  Chi non ha compilato la scheda riceve un fascicolo di riserva (squadra e ordine di ingresso).

Le schede restano in memoria sul PC e non escono dalla rete di casa. Suggerimento pratico: ricordate
alle ragazze di scrivere cose leggere, che sarebbero contente di sentir leggere ad alta voce dalle altre.

## Gli 8 atti (~55 minuti)

| # | Atto | Meccanica | Dove si gioca |
|---|------|-----------|---------------|
| 1 | Stabilizzare il battito | Tutte devono tenere premuto il telefono nello stesso istante per 3 s | telefoni + anello di avanzamento sullo schermo |
| 2 | Il biglietto strappato | Ogni squadra ha una parola divisa a strisce tra i suoi telefoni: vanno messi fianco a fianco nell'ordine giusto; le tre parole formano la frase ("CERCA TRE FIALE") | telefoni fisicamente affiancati |
| 3 | L'interrogatorio | Fascicoli generati dalle schede riservate; ogni identificazione svela lettere della parola d'ordine (CONTROVELENO) | telefoni + schermo |
| 4 | Il quadro elettrico | Griglia 4×3 "lights out": ogni telefono controlla un interruttore, premendo si invertono anche i vicini; obiettivo tutti accesi | telefoni + schermo in tempo reale |
| 5 | Le tre fiale | Tre QR stampati e nascosti in casa; chi li inquadra scopre una cifra del codice finale | fotocamera dei telefoni + casa |
| 6 | Le prove spariscono | Ognuna deve inquadrare il QR sullo schermo, che cambia ogni 25 s | fotocamera dei telefoni + schermo |
| 7 | La formula dell'antidoto | Simon a squadre: lo schermo mostra una sequenza di colori, le squadre la ripetono col proprio pulsante (3 round) | schermo + telefoni |
| 8 | La cassetta dei farmaci | Tutte devono inserire il codice a 3 cifre (le fiale dell'atto 5) entro 20 s dalla prima | telefoni |

Al termine: coriandoli, il risveglio di Martina, tempo impiegato e suggerimenti usati.

## Scene animate e video sui telefoni

All'inizio di ogni atto, al prologo, allo scadere del tempo e a ogni suggerimento, i telefoni mostrano
una breve scena a tutto schermo: disegni animati (elettrocardiogramma, biglietto strappato, fascicolo con
timbro, quadro elettrico, fiale, prova fotografata, formula, lucchetto), testo che si scrive da solo,
vibrazione, e i messaggi "in arrivo" dal Cuoco in stile chat con l'indicatore "sta scrivendo".
Un tocco salta il testo, il pulsante finale (INIZIA / HO CAPITO) chiude la scena. Se arriva una scena nuova
mentre una è ancora aperta, la nuova la sostituisce: nessuna resta indietro.

Le scene sono in `lib/content.js` (`SCENES`): ogni voce ha `art` (nome del disegno in `public/cine.js`),
`title`, `text`, `ms` (durata minima) e `buzz` (vibrazione). Le scene `chat` sono elenchi di messaggi.

**Video opzionali.** Se vuoi filmati veri (per esempio un genitore mascherato che recita "Il Cuoco"),
metti i file in `public/media/` con questi nomi: `prologue.mp4`, `sync.mp4`, `fragments.mp4`, `riddles.mp4`,
`lights.mp4`, `qrhunt.mp4`, `reconnect.mp4`, `simon.mp4`, `vault.mp4`, `dead.mp4`, `hint.mp4` (anche `.webm`).
Il video viene mostrato prima delle scene animate di quel momento, con un pulsante "GUARDA" (i browser dei
telefoni non permettono l'avvio automatico con audio). Consigli: formato verticale o quadrato, 10-20 secondi,
H.264 a risoluzione 720p o inferiore, così si carica in un attimo sulla rete di casa.

## Cosa serve

- Un PC (Windows, macOS o Linux) con [Node.js](https://nodejs.org) 18 o superiore.
- Un TV/proiettore/monitor collegato al PC per lo schermo grande (o un tablet che apre la pagina).
- Un router Wi-Fi a cui sono connessi PC e cellulari (nessun accesso a Internet necessario).
- Una stampante per i 3 QR delle fiale nascoste (opzionale: c'è un codice di riserva da digitare).

## Avvio

```bash
npm install
npm start
```

Il terminale stampa gli indirizzi da usare, per esempio:

```
  Telefoni  : http://192.168.1.20:3000/
  Schermo   : http://192.168.1.20:3000/screen
  Regia     : http://192.168.1.20:3000/admin   (chiave: 4821)
  Stampa QR : http://192.168.1.20:3000/print?key=4821
```

1. Apri **/screen** sul TV a schermo intero (F11) e clicca "Attiva audio".
2. Apri **/admin** sul tuo telefono o su un secondo monitor: è la regia (chiave nel terminale).
3. Le ragazze inquadrano il QR sullo schermo, scrivono il nome, vengono assegnate automaticamente
   alla squadra con meno giocatrici (NEON, CYBER, PIXEL) e compilano la scheda riservata.
   Lo schermo e la regia mostrano quante schede sono state compilate.
4. Premi **Inizia** nella regia: parte il prologo e il timer di 60 minuti; poi **Livello 1**.
5. Ogni atto superato passa automaticamente al successivo dopo 7 secondi. Dalla regia puoi
   inviare suggerimenti (appaiono sullo schermo e fanno vibrare i telefoni), aggiungere tempo,
   saltare o ripetere un atto, forzare la soluzione, leggere le schede e le risposte.

### Prima della festa (checklist)

- [ ] Stampa la pagina **/print?key=...**: contiene il QR di ingresso e le 3 fiale con la posizione suggerita per nasconderle
      (frigorifero, sotto una sedia, specchio del bagno — modificabili in `config.json`).
- [ ] **Controlla l'indirizzo stampato all'avvio.** Se il PC ha schede virtuali (Hyper-V, WSL, VirtualBox, VPN) il server
      potrebbe scegliere quella sbagliata (per esempio `172.21.x.x`): all'avvio elenca tutti gli indirizzi trovati. Usa quello
      del Wi-Fi (di solito `192.168.x.x`, lo vedi con `ipconfig` su Windows) e avvia con `set HOST=192.168.1.25` e poi `npm start`
      (Windows) o `HOST=192.168.1.25 npm start` (macOS/Linux), oppure scrivilo in `config.json` alla voce `host`.
- [ ] **Assegna un IP fisso al PC** nel router (o stampa i QR il giorno stesso): i QR contengono l'indirizzo IP del PC.
      In alternativa, avvia con `HOST=192.168.1.20 npm start` per forzare l'indirizzo scritto nei QR.
- [ ] Verifica che il firewall del PC permetta connessioni in ingresso sulla porta 3000
      (Windows lo chiede al primo avvio: scegli "Consenti" per le reti private).
- [ ] Controlla che il router non abbia l'"isolamento client" (AP isolation) attivo, altrimenti i telefoni non vedono il PC.
- [ ] Fai una prova con 2-3 telefoni: `ADMIN_KEY=test npm start` e poi `node tools/simulate.js` in un altro terminale
      simula 12 giocatrici (schede comprese) e percorre tutti gli atti fino alla vittoria, passando anche per il tempo scaduto.
- [ ] Nella regia trovi le risposte di ogni atto (frase, fascicoli, parola d'ordine, codice della cassetta).

## Personalizzazione

Tutto è in due file:

- `config.json`: nome e età della festeggiata, nome della vittima, durata, nomi/colori delle squadre, codici e cifre delle fiale, porta.
- `lib/content.js`: testi della storia (prologo, vittoria, tempo scaduto), titoli/istruzioni/suggerimenti degli atti,
  le domande della scheda riservata, il modello del fascicolo, la parola d'ordine e le parole del biglietto strappato.

Funziona anche con un numero diverso di giocatrici (da 3 in su) e di squadre (2-4): fascicoli e interruttori
vengono distribuiti automaticamente tra chi è connessa.

## Come funziona (tecnica)

- `server.js`: Express + WebSocket (`ws`). Tiene lo stato del gioco in memoria e invia a ogni client
  solo la vista che gli spetta (lo schermo vede tutto, ogni telefono vede il proprio pezzo; le schede
  vanno solo alla regia).
- Identità del telefono: un id generato al primo ingresso, salvato in `localStorage` e in un cookie,
  così le pagine aperte dalla fotocamera (`/k/<fiala>`, `/r/<token>`) sanno chi ha scansionato.
- QR generati sul server con il pacchetto `qrcode` (nessuna risorsa esterna).
- Suoni sintetizzati con WebAudio sullo schermo; vibrazione sui telefoni (dove supportata, tipicamente Android).
- Se un telefono si blocca o ricarica la pagina, rientra automaticamente con lo stesso nome e la stessa scheda.

## Limiti noti

- Le strisce dell'atto 2 sono disegnate dal telefono con un font di sistema: telefoni con sistemi diversi
  possono mostrare lettere leggermente diverse, ma restano leggibili.
- La vibrazione non è disponibile su iPhone (limite di Safari).
- Lo stato (schede comprese) è in memoria: se riavvii il server la partita riparte dalla lobby.
