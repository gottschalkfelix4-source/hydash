# HyDash - Hytale Game Server Hosting Panel

Ein voll ausgestattetes Web-Panel zur Verwaltung von Hytale Game Servern mit Multi-Server-Unterstützung, Performance-Metriken, Backup-System, geplanten Aufgaben, Benutzerverwaltung und CurseForge-Mod-Integration.

## Features

- **Multi-Server-Verwaltung** - Erstelle, starte, stoppe und verwalte mehrere Hytale-Server gleichzeitig
- **Performance-Metriken** - Echtzeit-Überwachung von CPU, RAM, Netzwerk und JVM-Statistiken
- **Backup-System** - Automatische und manuelle Backups mit konfigurierbarer Aufbewahrungsdauer
- **Geplante Aufgaben** - Cron-basierte Tasks für Backups, Neustarts, Commands und Mod-Updates
- **Benutzerverwaltung** - Vollständiges RBAC-System mit granularer Berechtigungssteuerung
- **Mod-Management** - CurseForge-Integration zum Suchen, Installieren und Aktualisieren von Mods
- **WebSocket-Konsole** - Live-Server-Logs und Befehlsausführung direkt im Browser
- **Docker-Isolation** - Jeder Server läuft in einem eigenen Docker-Container

## Tech-Stack

### Backend
- Node.js 20 + Express 4 + TypeScript
- PostgreSQL 16 (Datenbank)
- Redis 7 (Cache + Distributed Locks)
- Docker/Dockerode (Container-Management)
- node-cron (Scheduled Tasks)
- Winston (Logging)

### Frontend
- React 18 + TypeScript
- Vite 5 (Build-Tool)
- Tailwind CSS 3 (Styling)
- Zustand (State Management)
- React Query (Server State)
- Recharts (Visualisierung)

## Schnellstart

### Voraussetzungen

- Docker + Docker Compose
- Node.js 20+ (für lokale Entwicklung)
- Zugriff auf Docker Socket (`/var/run/docker.sock`)

### Installation mit Docker Compose

1. Repository klonen:
```bash
cd C:\kimi code\ollama qwen 3.5 hydash
```

2. `.env`-Datei erstellen:
```bash
cp .env.example .env
```

3. JWT_SECRET generieren:
```bash
openssl rand -base64 32
```
Den Output in `.env` bei `JWT_SECRET` einfügen.

4. Docker Compose starten:
```bash
docker compose up -d
```

5. Panel öffnen:
- Frontend: http://localhost
- Backend API: http://localhost:3001
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### Standard-Login

Nach der ersten Inbetriebnahme ist ein Admin-Benutzer vorkonfiguriert:
- E-Mail: `admin@hydash.local`
- Passwort: `Admin123!@#`

**Wichtig:** Passwort sofort ändern!

## Konfiguration

### Umgebungsvariablen

| Variable | Beschreibung | Standard |
|----------|--------------|----------|
| `PORT` | Backend-API-Port | `3001` |
| `DATABASE_URL` | PostgreSQL Connection String | - |
| `REDIS_URL` | Redis Connection String | `redis://localhost:6379` |
| `JWT_SECRET` | Secret für JWT-Tokens | - |
| `CURSEFORGE_API_KEY` | CurseForge API Key (optional) | - |
| `BACKUP_DIR` | Backup-Speicherverzeichnis | `/var/hydash/backups` |
| `SERVER_DATA_DIR` | Server-Datenverzeichnis | `/var/hydash/servers` |

### Docker-Netzwerk

Das Panel erstellt ein Docker-Netzwerk `hydash-net` für die Kommunikation zwischen den Services.

## API-Endpunkte

Alle API-Endpunkte sind unter `/api/v1` verfügbar:

### Authentifizierung
- `POST /auth/register` - Benutzer registrieren
- `POST /auth/login` - Anmelden
- `POST /auth/refresh` - Token aktualisieren
- `GET /auth/me` - Aktuelle Benutzerinfos

### Server
- `GET /servers` - Server-Liste
- `POST /servers` - Server erstellen
- `GET /servers/:id` - Server-Details
- `PUT /servers/:id` - Server aktualisieren
- `DELETE /servers/:id` - Server löschen
- `POST /servers/:id/start` - Server starten
- `POST /servers/:id/stop` - Server stoppen
- `POST /servers/:id/restart` - Server neustarten

### Backups
- `GET /servers/:id/backups` - Backups auflisten
- `POST /servers/:id/backups` - Backup erstellen
- `POST /backups/:id/restore` - Backup wiederherstellen
- `DELETE /backups/:id` - Backup löschen

### Scheduled Tasks
- `GET /servers/:id/tasks` - Aufgaben auflisten
- `POST /servers/:id/tasks` - Aufgabe erstellen
- `POST /tasks/:id/execute` - Aufgabe manuell ausführen
- `POST /tasks/:id/enable` - Aufgabe aktivieren
- `POST /tasks/:id/disable` - Aufgabe deaktivieren
- `DELETE /tasks/:id` - Aufgabe löschen

### Monitoring
- `GET /monitoring/overview` - Gesamtübersicht
- `GET /servers/:id/monitoring/current` - Aktuelle Metriken
- `GET /servers/:id/monitoring/history` - Historische Metriken
- `GET /servers/:id/monitoring/health` - Gesundheitsanalyse

### Admin
- `GET /admin/users` - Benutzer auflisten
- `POST /admin/users` - Benutzer erstellen
- `GET /admin/roles` - Rollen auflisten
- `POST /admin/roles` - Rolle erstellen
- `GET /admin/permissions` - Berechtigungen auflisten

## Hytale Server-Konfiguration

### Server-Startparameter

```bash
java -Xms6G -Xmx6G -XX:+UseG1GC -XX:AOTCache=HytaleServer.aot \
  -jar HytaleServer.jar --assets ../Assets.zip --backup --backup-frequency 30
```

### config.json (Auszug)

```json
{
  "ConfigVersion": 3,
  "ServerName": "Mein Server",
  "MaxPlayers": 100,
  "MaxViewRadius": 12,
  "RateLimit": {
    "Enabled": true,
    "PacketsPerSecond": 2000
  }
}
```

## Scheduled Tasks - Cron-Ausdrücke

Beispiele für Cron-Ausdrücke:

```
# Täglich um 3:00 Uhr
0 3 * * *

# Alle 6 Stunden
0 */6 * * *

# Jeden Montag um 2:00 Uhr
0 2 * * 1

# Alle 15 Minuten
*/15 * * * *

# Einmalige Aufgabe (cronExpression: null)
```

## Entwicklung

### Backend entwickeln

```bash
cd backend
npm install
npm run dev
```

### Frontend entwickeln

```bash
cd frontend
npm install
npm run dev
```

### Build

```bash
npm run build
```

## Sicherheit

- **RBAC** - Granulare Berechtigungen für alle Aktionen
- **JWT** - Token-basierte Authentifizierung
- **Rate Limiting** - 200 Requests pro 15 Minuten pro IP
- **Security Headers** - Helmet für sichere HTTP-Header
- **Input Validation** - Zod-Schemas für alle Eingaben
- **Docker Isolation** - Jeder Server in separatem Container

## Projektstruktur

```
hydash/
├── backend/                 # Node.js/Express Backend
│   ├── src/
│   │   ├── controllers/     # Request-Handler
│   │   ├── services/        # Business-Logik
│   │   ├── routes/          # API-Routes
│   │   ├── middleware/      # Auth + RBAC
│   │   ├── models/          # DB + Redis
│   │   ├── utils/           # Docker, Backup, Scheduler
│   │   ├── types/           # TypeScript-Interfaces
│   │   └── websocket/       # Console-Streaming
│   └── migrations/          # SQL-Migrationen
├── frontend/                # React Frontend
│   └── src/
│       ├── components/      # UI-Komponenten
│       ├── pages/           # Routen-Seiten
│       ├── services/        # API-Client
│       ├── store/           # Zustand State
│       └── hooks/           # React Hooks
└── docker-compose.yml       # Docker-Entwicklung
```

## Lizenz

MIT - Siehe LICENSE-Datei.

## Danksagung

- Hytale von [Hypixel Studios](https://hytale.com/)
- CurseForge API von [Overwolf](https://docs.curseforge.com/)
- Inspiriert von [HytalePanel](https://github.com/nebula-codes/hytale_server_manager)