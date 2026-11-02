# Dossier mutuo SAL · Casa Buretta

Piccola app web per gestire la richiesta di mutuo a stato avanzamento lavori: banche, 12 domande, offerte, documenti (con caricamento file), costi, pagamenti e passi.

Tutto vive in una sola cartella dati:

```
data/
├── state.json            ← il "JSON master" con tutti i dati dell'app
├── backup/               ← copie automatiche di state.json (max 1 ogni 5 min, ultime 60)
├── documenti/<gruppo>/   ← file caricati dal Portafoglio documenti
├── banche/<banca>/       ← allegati di ogni banca (PIES, offerte, email)
└── cestino/              ← file rimossi dall'app (non vengono mai cancellati davvero)
```

Server Node senza dipendenze (`server.js`), front end statico in `public/`.

## Avvio in locale

```bash
node server.js            # http://localhost:8790, dati in ./data
```

Variabili utili: `PORT` (8790), `DATA_DIR` (./data), `DOSSIER_PASSWORD` (vuota = nessuna password), `MAX_UPLOAD_MB` (200), `KEEP_BACKUPS` (60).

Se apri `public/index.html` senza server, l'app funziona in modalità solo memoria: niente upload e salvataggio solo tramite "Esporta dati".

## Installazione su Umbrel

### Opzione A, consigliata: SSH e Docker Compose (5 minuti)

Funziona su qualsiasi umbrelOS, non richiede GitHub pubblico e i file finiscono in una cartella che vedi nell'app **File**.

1. Dal tuo PC copia la cartella del progetto sull'Umbrel (password = quella di Umbrel):
   ```bash
   scp -r dossier-mutuo umbrel@umbrel.local:~/
   ```
   oppure, se il repo è su GitHub: `ssh umbrel@umbrel.local` e poi `git clone https://github.com/svarion1/dossier-mutuo.git`.
2. Entra nell'Umbrel e prepara la cartella dati (deve appartenere all'utente `umbrel`, uid 1000):
   ```bash
   ssh umbrel@umbrel.local
   ls ~/umbrel/home            # deve esistere: è la Home dell'app File
   mkdir -p ~/umbrel/home/Dossier-mutuo
   cd ~/dossier-mutuo
   cp .env.example .env        # DATA_PATH punta già a ~/umbrel/home/Dossier-mutuo
   nano .env                   # opzionale: imposta DOSSIER_PASSWORD
   ```
3. Avvia:
   ```bash
   sudo docker compose up -d --build
   sudo docker compose logs -f   # deve dire "in ascolto su :8790"
   ```
4. Apri **http://umbrel.local:8790** dal PC o dal telefono sulla rete di casa.

Il container ha `restart: unless-stopped`, quindi riparte da solo al riavvio dell'Umbrel.

Aggiornare dopo modifiche al codice:
```bash
cd ~/dossier-mutuo && git pull && sudo docker compose up -d --build
```

Nota: un container avviato così non compare tra le icone della home di Umbrel. Puoi aggiungere un segnalibro alla pagina, oppure usare l'opzione C.

### Opzione B: Portainer (dall'App Store di Umbrel)

1. Installa **Portainer** dall'App Store di Umbrel.
2. Stacks → Add stack → incolla `docker-compose.yml`, ma sostituisci `build: .` con `image: ghcr.io/svarion1/dossier-mutuo:latest`. L'immagine deve esistere, vedi l'opzione C.
3. Portainer su Umbrel gira dentro un Docker separato. Usa un volume con nome (es. `dossier-data:/data`) invece della cartella `./data`. Di conseguenza i file non saranno visibili nell'app File.

### Opzione C: App Store della community (icona nella home di Umbrel)

Il repo è già pronto come store della community: `umbrel-app-store.yml` (id `alex`) e la cartella `alex-dossier-mutuo/`.

1. Pubblica il repo su GitHub. Il workflow `.github/workflows/docker.yml` costruisce l'immagine `ghcr.io/svarion1/dossier-mutuo:latest` per amd64 e arm64.
2. Umbrel deve poter scaricare sia il repo sia l'immagine senza login. Quindi repo e pacchetto GHCR devono essere **pubblici**. Attenzione: `public/data.js` contiene i dati iniziali (redditi, banche, costi). Prima di renderlo pubblico conviene svuotarlo, tanto i dati veri stanno in `state.json` sull'Umbrel.
3. Su Umbrel: App Store → menu "⋯" in alto a destra → Community App Stores → incolla l'URL del repo → Add.
4. Apri lo store "Alex" e installa "Dossier mutuo". I dati vanno in `~/umbrel/app-data/alex-dossier-mutuo/data/` e il login di Umbrel protegge l'accesso.

## Backup

- Automatico: `data/backup/state-*.json`.
- Manuale: "Esporta dati" nell'app (JSON) oppure copia tutta la cartella:
  ```bash
  scp -r umbrel@umbrel.local:~/umbrel/home/Dossier-mutuo ./backup-dossier
  ```
- Ripristino: "Importa" nell'app, oppure sostituisci `state.json` a server fermo.

## Più dispositivi

Ogni salvataggio porta un numero di revisione. Se modifichi dal telefono e dal PC insieme, l'app mostra un avviso e ti fa scegliere quale versione tenere. Non sovrascrive mai i dati in silenzio.

## Sicurezza

Senza password, chiunque sia sulla rete di casa può aprire l'app. Imposta `DOSSIER_PASSWORD` se la rete è condivisa (utente qualsiasi, password quella scelta). Non esporre la porta 8790 su Internet. Per l'accesso da fuori usa Tailscale, disponibile nell'App Store di Umbrel.
