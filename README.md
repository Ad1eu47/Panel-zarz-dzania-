# Holdings Management

Gotowy panel Holdings Panel: Discord OAuth, terminy i przedłużenia, koszty, alerty Discord, PWA/Web Push, pieniądze, kalendarz z własnymi wpisami, LS Motors, dokumenty R2, karty graczy po CID, eksport i log aktywności.

## 1. Cloudflare

Zainstaluj Node.js 20+ i w katalogu projektu:
```bash
npm install
npx wrangler login
```

Utwórz D1:
```bash
npx wrangler d1 create holdings-panel
```
Skopiuj zwrócone `database_id` do `worker/wrangler.jsonc` zamiast `PUT_D1_DATABASE_ID_HERE`.

Utwórz prywatny bucket dokumentów:
```bash
npx wrangler r2 bucket create holdings-panel-docs
```

Wgraj schemat:
```bash
npm run db:migrate
```

## 2. Discord OAuth

W Discord Developer Portal utwórz aplikację. W OAuth2 dodaj Redirect URL:
`https://TWOJ-WORKER.workers.dev/auth/discord/callback`

Potrzebujesz:
- Client ID
- Client Secret
- własnego Discord User ID jako ADMIN_DISCORD_ID

## 3. Webhook kanału alarmowego

Na serwerze Discord utwórz kanał alarmowy i webhook. Skopiuj URL webhooka. Dla każdego terminu można później podać ID roli Discord, która ma dostać ping.

System przy kolejnym progu alertu usuwa poprzednią wiadomość webhooka i publikuje nową. Po przedłużeniu usuwa aktualny alert i zaczyna liczyć od nowej daty. Nie wysyła alertu po wygaśnięciu.

Domyślne progi: 72h, 24h, 12h, 6h, 1h. Cron sprawdza terminy co 5 minut.

## 4. Web Push

Wygeneruj VAPID:
```bash
npx web-push generate-vapid-keys
```
Zachowaj Public Key i Private Key.

## 5. Sekrety Workera

Po pierwszym deployu Workera ustaw:
```bash
npx wrangler secret put DISCORD_CLIENT_ID --config worker/wrangler.jsonc
npx wrangler secret put DISCORD_CLIENT_SECRET --config worker/wrangler.jsonc
npx wrangler secret put DISCORD_REDIRECT_URI --config worker/wrangler.jsonc
npx wrangler secret put DISCORD_WEBHOOK_URL --config worker/wrangler.jsonc
npx wrangler secret put ADMIN_DISCORD_ID --config worker/wrangler.jsonc
npx wrangler secret put SESSION_SECRET --config worker/wrangler.jsonc
npx wrangler secret put VAPID_PUBLIC_KEY --config worker/wrangler.jsonc
npx wrangler secret put VAPID_PRIVATE_KEY --config worker/wrangler.jsonc
npx wrangler secret put VAPID_SUBJECT --config worker/wrangler.jsonc
```

`SESSION_SECRET` ustaw jako długi losowy ciąg. `VAPID_SUBJECT` może mieć postać `mailto:twoj@email.pl`.

## 6. Deploy API

```bash
npm run worker:deploy
```

Zapisz adres w stylu:
`https://holdings-panel-api.TWOJ-SUBDOMAIN.workers.dev`

W `worker/wrangler.jsonc` ustaw `APP_URL` na docelowy adres frontendu Cloudflare Pages i ponownie wykonaj deploy.

## 7. Frontend Cloudflare Pages

Połącz to repozytorium z Cloudflare Pages.

Build command:
`npm run build`

Output directory:
`dist`

Dodaj zmienne środowiskowe Pages:
```
VITE_API_URL=https://TWOJ-WORKER.workers.dev
VITE_VAPID_PUBLIC_KEY=TWÓJ_PUBLIC_VAPID_KEY
```

Po pierwszym deployu skopiuj adres Pages do `APP_URL` w `worker/wrangler.jsonc`.

## 8. Pierwsze logowanie

Konto Discord, którego ID wpiszesz jako `ADMIN_DISCORD_ID`, automatycznie dostanie rolę admin i status active.

Pozostałe nowe konta trafiają jako pending. Można je aktywować w D1, przypisując postać Burhan/Zayid/Amir:
```sql
UPDATE users SET status='active', character_name='Zayid', role='member' WHERE discord_id='DISCORD_ID';
```

Analogicznie dla Amira. Burhan może być kontem administratora.

## 9. LS Motors

Nowa sprzedaż zapisuje kupującego, CID, pojazd, rejestrację, datę, cenę, formę płatności, dodatkowe ustalenia i sprzedawcę. Numer umowy tworzy się automatycznie jako `LSM/ROK/XXXX`.

Wypełnioną umowę PDF/JPG/PNG dodajesz przy sprzedaży. Plik trafia do prywatnego R2, a rekord sprzedaży przechowuje tylko klucz dokumentu. Karta gracza jest tworzona/aktualizowana automatycznie po CID.

## 10. Telefon / PWA

Otwórz stronę przez HTTPS, dodaj ją do ekranu głównego i w Ustawieniach kliknij „Włącz powiadomienia telefonu”. Przeglądarka musi udzielić zgody na powiadomienia.

## Dane, których NIE wpisuj do GitHuba

Nigdy nie commituj Client Secret, webhooka Discord, VAPID Private Key ani SESSION_SECRET. Wszystkie te wartości trafiają do Cloudflare jako sekrety Workera.

## Lokalnie

Skopiuj `.env.example` do `.env` oraz `worker/.dev.vars.example` do `worker/.dev.vars`, uzupełnij wartości, a następnie uruchom frontend i Workera w dwóch terminalach:
```bash
npm run dev
npm run worker:dev
```
