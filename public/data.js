// Dati iniziali: banche, domande, documenti, costi e passi emersi dall'analisi.
window.SEED = (function () {
  let n = 0;
  const id = (p) => p + '_' + (++n);

  const QUESTIONS = [
    { k: 'intervento', t: 'Intervento ammesso', q: 'Finanziate a privati demolizione e ricostruzione, con ampliamento autorizzato, su immobile già posseduto?' },
    { k: 'legno', t: 'Casa in legno', q: 'Accettate una struttura prefabbricata in legno? Quali certificazioni richiedete al produttore e al sistema costruttivo?' },
    { k: 'estero', t: 'Fornitore estero', q: 'È ammissibile un produttore ungherese con trasporto e montaggio, più imprese italiane per demolizione, platea e completamenti? Fatture UE accettate?' },
    { k: 'proprieta', t: 'Proprietà e usufrutto', q: 'Potete valutare nuda proprietà (fratello e sorella) con genitori usufruttuari? Chi deve intervenire come mutuatario o terzo datore d’ipoteca?' },
    { k: 'pregresso', t: 'Investimento già sostenuto', q: 'Quali importi già pagati riconoscete come apporto proprio (acquisto, lavori, progettazione, oneri, permessi)? Con quali documenti?' },
    { k: 'base', t: 'Base del finanziamento', q: 'Il limite si applica al costo dei lavori, al costo complessivo incluso il terreno o al valore finale di perizia?' },
    { k: 'prima', t: 'Prima erogazione', q: 'È possibile una somma iniziale prima dei lavori? Come viene determinata e quando è disponibile? Erogate già dopo demolizione e platea?' },
    { k: 'anticipi', t: 'Anticipi al produttore', q: 'Potete finanziare anticipi o lavorazioni in stabilimento prima che la struttura sia installata? Servono garanzie particolari?' },
    { k: 'sal', t: 'SAL successivi', q: 'Quante tranche e perizie, con quali costi e tempi di svincolo? Le tranche vanno sul nostro conto o al fornitore?' },
    { k: 'cantiere', t: 'Periodo di cantiere', q: 'Quanto dura il preammortamento, come si calcolano gli interessi e cosa succede in caso di ritardo?' },
    { k: 'costi', t: 'Costo complessivo', q: 'TAN, TAEG, istruttoria, perizie SAL, assicurazione (anche incendio per casa in legno), atti successivi e servizi collegati?' },
    { k: 'next', t: 'Passaggio successivo', q: 'Quali documenti servono per una prima valutazione reddituale e tecnica, prima di una domanda formale?' }
  ];

  const bank = (o) => Object.assign({
    id: id('b'), status: 'da_contattare', referente: '', notes: '', answers: {}, log: [],
    offer: { importo: '', tan: '', taeg: '', durata: '', tipo: '', ltv: '', istruttoria: '', perizia: '', primaErogazione: '', pregresso: '', preammortamento: '', note: '' }
  }, o);

  const BANKS = [
    bank({ name: 'Intesa Sanpaolo', group: 'Primo gruppo', address: 'Via San Ciriaco 25, Ciriè', phone: '011 9218211', email: '', web: 'https://www.intesasanpaolo.com/portalIbve/pdf/filiali/filiali_01025.pdf',
      why: 'Il prodotto costruzione/ristrutturazione contempla prefabbricati in bioedilizia, fino all’80% dei costi a SAL. Verificare requisiti del produttore e polizza incendio specifica.' }),
    bank({ name: 'Banco BPM', group: 'Primo gruppo', address: 'Piazza San Giovanni 1, Ciriè', phone: '011 9218811', email: 'filiale.00350@bancobpm.it', web: 'https://www.bancobpm.it',
      why: 'Documentazione per consumatori su costruzione e ristrutturazione con erogazioni SAL. Chiedere ammissibilità del legno e del produttore estero.' }),
    bank({ name: 'Banca Sella', group: 'Primo gruppo', address: 'Via Andrea D’Oria 14/10, Ciriè (da riconfermare)', phone: '', email: '', web: 'https://www.sella.it/banca-on-line/privati/finanziamenti/mutui/mutuo',
      why: 'Fogli informativi SAL a tasso fisso e variabile. Primo contatto tramite modulo di ricontatto. Verificare se copre demolizione e ricostruzione.' }),
    bank({ name: 'Banca Etica', group: 'Primo gruppo', address: 'Via Saluzzo 29, Torino (su appuntamento)', phone: '800 893233', email: '', web: 'https://www.bancaetica.it/filiale/filiale-di-torino/',
      why: 'Mutuo Casa/CasaVerde a SAL fino all’80% del valore delle opere incluso il terreno: utile per far riconoscere l’investimento già fatto. CasaVerde richiede classe A3 o migliore.' }),
    bank({ name: 'Banca del Piemonte', group: 'Secondo gruppo', address: 'Via Vittorio Emanuele 154, Ciriè', phone: '011 9222424', email: 'cirie@bancadelpiemonte.it', web: 'https://www.bancadelpiemonte.it/privati-e-famiglie/mutui/mutuo-soluzione-bp-casa-green-2/',
      why: 'Mutuo Edilizio Privati Green. Attenzione: il foglio 2025 indica max 50% del costo di costruzione comprensivo dell’area. Email da riconfermare.' }),
    bank({ name: 'Banca di Asti', group: 'Secondo gruppo', address: 'Via Pasquale Trivero 19, Ciriè', phone: '011 9202118', email: '', web: 'https://bancadiasti.it/assistenza-e-contatti',
      why: 'Interlocutore locale. Prodotto SAL per privati non verificato: prima domanda è se lo offrono.' }),
    bank({ name: 'UniCredit', group: 'Secondo gruppo', address: 'Corso Martiri della Libertà 35, Ciriè', phone: '011 19410803', email: '', web: 'https://trasparenza.unicredit.it/pdfprod/IGCIC141_INFORMAZIONI+GENERALI+SUL++CREDITO+IMMOBILIARE+OFFERTO+A+CONSUMATORI+Mutuo+UniCredit+SAL.pdf',
      why: 'Mutuo SAL fino all’80% delle spese sostenute, max 24 mesi di cantiere con rate di soli interessi. Alcuni utenti segnalano spread alto.' }),
    bank({ name: 'Banca d’Alba', group: 'Secondo gruppo', address: 'Piazza Martiri della Libertà 12, Rivara', phone: '0124 310272', email: 'info@bancadalba.it', web: 'https://www.bancadalba.it',
      why: 'Banca territoriale vicina a Rocca Canavese. SAL per privati e casa in legno da verificare.' }),
    bank({ name: 'Crédit Agricole Italia', group: 'Da valutare', address: '', phone: '', email: '', web: 'https://www.credit-agricole.it/faq/mutui/cose-un-mutuo-a-stato-avanzamento-lavori-sal',
      why: 'Mutuo SAL fino a 4 tranche, tra i più citati dagli utenti. Cercare la filiale più vicina.' }),
    bank({ name: 'BPER Banca', group: 'Da valutare', address: '', phone: '', email: '', web: 'https://www.bper.it/privati/mutui',
      why: 'Mutuo costruzione casa max 80%, fino a 30 anni. Chiedere conferma in filiale che lo trattino.' })
  ];

  const doc = (set, name, hint) => ({ id: id('d'), set, name, hint: hint || '', status: 'mancante', location: '', note: '' });
  const DOCS = [
    doc('Scheda sintetica', 'Pagina di copertina dell’operazione', 'Intervento, proprietari, costo totale, mezzi propri, mutuo richiesto, durata, redditi, stato progetto, anticipi.'),
    doc('Persone e redditi', 'Documento d’identità e codice fiscale (Alessandro)'),
    doc('Persone e redditi', 'Ultime 2 buste paga'),
    doc('Persone e redditi', 'CU o ultima dichiarazione dei redditi con ricevuta'),
    doc('Persone e redditi', 'Contratto a tempo indeterminato o attestazione del datore', 'Con anzianità e tipo di rapporto.'),
    doc('Persone e redditi', 'Estratti conto ultimi 3 mesi', 'Con saldo aggiornato e accrediti dello stipendio visibili.'),
    doc('Persone e redditi', 'Prospetto rate esistenti, spese e liquidità disponibile'),
    doc('Persone e redditi', 'Residenza, stato civile, regime patrimoniale'),
    doc('Persone e redditi', 'Sorella: identità, ultime 2 dichiarazioni, ricevute, F24', 'Solo se cointestataria. Come terza datrice d’ipoteca bastano identità e dati.'),
    doc('Persone e redditi', 'Genitori: identità e codice fiscale', 'Usufruttuari, probabili terzi datori d’ipoteca.'),
    doc('Proprietà e catasto', 'Atto di provenienza (acquisto, donazione o successione)'),
    doc('Proprietà e catasto', 'Visura catastale aggiornata'),
    doc('Proprietà e catasto', 'Planimetria catastale del fabbricato esistente'),
    doc('Proprietà e catasto', 'Estratto di mappa del terreno'),
    doc('Proprietà e catasto', 'Nota quote: nuda proprietà 50/50 e usufrutto genitori'),
    doc('Proprietà e catasto', 'Ispezione ipotecaria (assenza di gravami)'),
    doc('Proprietà e catasto', 'Conferma dell’avvocato: la causa non coinvolge l’immobile'),
    doc('Progetto e titoli', 'Permesso di costruire'),
    doc('Progetto e titoli', 'Proroga inizio lavori con data di scadenza'),
    doc('Progetto e titoli', 'Tavole del progetto approvato (architetto)'),
    doc('Progetto e titoli', 'Ampliamenti e variante al piano regolatore approvati'),
    doc('Progetto e titoli', 'Computo metrico estimativo approvato', 'Da aggiornare a prezzi attuali e suddividere per fasi SAL.'),
    doc('Progetto e titoli', 'Nomina nuovo direttore lavori e comunicazione al Comune'),
    doc('Progetto e titoli', 'Relazione o previsione energetica (classe prevista)'),
    doc('Progetto e titoli', 'Documentazione allacci acqua e luce, fitodepurazione, scarichi'),
    doc('Preventivi e fornitori', 'Offerta produttore ungherese: struttura, trasporto, montaggio', 'Prezzo chiuso 30–40.000 €. Indicare cosa include (isolamento, serramenti, tetto) e IVA.'),
    doc('Preventivi e fornitori', 'Certificazioni produttore e sistema costruttivo', 'Qualità dei processi produttivi, eventuale PEFC/FSC.'),
    doc('Preventivi e fornitori', 'Preventivo demolizione (con trasporto e smaltimento)'),
    doc('Preventivi e fornitori', 'Preventivo platea di fondazione'),
    doc('Preventivi e fornitori', 'Preventivi infissi, impianti, pavimenti, finiture'),
    doc('Preventivi e fornitori', 'Quadro economico complessivo', 'Tutte le voci, senza sovrapposizioni tra preventivi.'),
    doc('Pagamenti e anticipi', 'Calendario pagamenti del produttore'),
    doc('Pagamenti e anticipi', 'Calendario pagamenti delle imprese locali'),
    doc('Pagamenti e anticipi', 'Piano di copertura anticipi con mezzi propri'),
    doc('Pagamenti e anticipi', 'Preventivo polizza incendio per casa in legno'),
    doc('Spese già sostenute', 'Rogito e prove di pagamento dell’acquisto'),
    doc('Spese già sostenute', 'Fatture e bonifici della progettazione'),
    doc('Spese già sostenute', 'Ricevute oneri di urbanizzazione e permessi'),
    doc('Spese già sostenute', 'Fatture lavori già eseguiti (allacci, fitodepurazione, scarichi)'),
    doc('Spese già sostenute', 'Prospetto riepilogativo delle spese sostenute')
  ];

  const SPENT = [
    { id: id('s'), label: 'Acquisto terreno / immobile', amount: 0, proof: false, note: '' },
    { id: id('s'), label: 'Progettazione architetto e tecnici', amount: 0, proof: false, note: '' },
    { id: id('s'), label: 'Oneri di urbanizzazione', amount: 0, proof: false, note: '' },
    { id: id('s'), label: 'Permessi e pratiche', amount: 0, proof: false, note: '' },
    { id: id('s'), label: 'Allacci acqua e luce', amount: 0, proof: false, note: '' },
    { id: id('s'), label: 'Fitodepurazione e scarichi', amount: 0, proof: false, note: '' }
  ];

  const TODO = [
    { id: id('c'), label: 'Struttura in legno + trasporto + montaggio', min: 30000, max: 40000, kind: 'preventivo', note: 'Prezzo chiuso dal produttore ungherese' },
    { id: id('c'), label: 'Demolizione', min: 8000, max: 8000, kind: 'preventivo', note: '' },
    { id: id('c'), label: 'Platea di fondazione', min: 10000, max: 10000, kind: 'preventivo', note: '' },
    { id: id('c'), label: 'Infissi, impianti, pavimenti, bagno, materiali', min: 25000, max: 55000, kind: 'stima', note: 'Da sostituire con i preventivi' },
    { id: id('c'), label: 'Direttore lavori, fine lavori, imprevisti', min: 5000, max: 10000, kind: 'stima', note: '' }
  ];

  const PAYMENTS = [
    { id: id('p'), label: 'Anticipo produttore all’ordine', amount: 0, date: '', cover: 'da_definire' },
    { id: id('p'), label: 'Demolizione', amount: 8000, date: '', cover: 'da_definire' },
    { id: id('p'), label: 'Platea', amount: 10000, date: '', cover: 'da_definire' },
    { id: id('p'), label: 'Saldo produttore alla consegna / montaggio', amount: 0, date: '', cover: 'da_definire' },
    { id: id('p'), label: 'Impianti e finiture', amount: 0, date: '', cover: 'da_definire' },
    { id: id('p'), label: 'Fine lavori, agibilità', amount: 0, date: '', cover: 'da_definire' }
  ];

  const task = (group, label) => ({ id: id('t'), group, label, done: false, due: '', note: '' });
  const TASKS = [
    task('Tecnico', 'Nominare il nuovo direttore lavori (architetto o altro tecnico)'),
    task('Tecnico', 'Comunicare il cambio di direttore lavori al Comune'),
    task('Tecnico', 'Verificare la data esatta di scadenza della proroga inizio lavori'),
    task('Tecnico', 'Aggiornare il computo metrico a prezzi attuali e per fasi SAL'),
    task('Fornitori', 'Chiedere al produttore cosa include il pacchetto (isolamento, serramenti, tetto)'),
    task('Fornitori', 'Ottenere offerta scritta del produttore: prezzo, tempi, IVA UE, fatturazione'),
    task('Fornitori', 'Ottenere il calendario pagamenti del produttore'),
    task('Fornitori', 'Raccogliere preventivi di demolizione e platea'),
    task('Fornitori', 'Raccogliere preventivi di infissi, impianti e finiture'),
    task('Proprietà', 'Notaio: verificare nuda proprietà e usufrutto prima di impegnarsi'),
    task('Proprietà', 'Decidere il ruolo della sorella: cointestataria o terza datrice d’ipoteca'),
    task('Proprietà', 'Concordare con i genitori la firma come terzi datori d’ipoteca'),
    task('Proprietà', 'Avvocato: confermare per iscritto che la causa non coinvolge l’immobile'),
    task('Banche', 'Compilare la scheda sintetica di una pagina'),
    task('Banche', 'Inviare le email esplorative al primo gruppo'),
    task('Banche', 'Contattare il secondo gruppo'),
    task('Banche', 'Registrare le risposte alle 12 domande per ogni banca'),
    task('Banche', 'Fissare gli incontri con le banche che possono valutare il caso'),
    task('Banche', 'Chiedere offerte omogenee (stesso importo, durata, calendario SAL)'),
    task('Banche', 'Confrontare TAEG e costo totale, non solo la rata'),
    task('Banche', 'Scegliere la banca e avviare l’istruttoria'),
    task('Cantiere', 'Organizzare l’alloggio durante il cantiere'),
    task('Cantiere', 'Preventivo polizza incendio specifica per casa in legno'),
    task('Cantiere', 'Accantonare una riserva per imprevisti del 10–15%'),
    task('Cantiere', 'Firmare il contratto col produttore solo con copertura finanziaria chiara')
  ];

  return {
    QUESTIONS,
    state: {
      version: 1,
      profile: { reddito: 1900, aiutoFamiglia: 550, mezziPropri: 0, tan: 3.5, durata: 25, ltv: 80, soglia: 35 },
      email: { intestatari: 'nuda proprietà al 50% tra me e mia sorella, usufrutto ai nostri genitori', importo: '', costoResiduo: '', nome: 'Alessandro Scisci', telefono: '', fornitoreScelto: false },
      banks: BANKS, docs: DOCS, spent: SPENT, todo: TODO, payments: PAYMENTS, tasks: TASKS
    }
  };
})();
