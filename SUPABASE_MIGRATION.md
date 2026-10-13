# DHBWMarkt – Supabase-Umstellung

## Aktueller Stand
- Supabase Auth ist die Quelle für Registrierung, Anmeldung und Passwort-Reset.
- Profile werden durch den Datenbank-Trigger in `public.profiles` angelegt.
- Der Browser nutzt nur die Publishable Key. Niemals einen `service_role`- oder Secret-Key veröffentlichen.
- Anzeigen, Favoriten, Chat und Admin-Dashboard müssen separat auf die Datenbank-API umgestellt werden; diese Änderung allein macht sie noch nicht geräteübergreifend.

## Vor dem Test
1. Im Supabase-Dashboard unter **Authentication → URL Configuration** die Website-URL und erlaubte Redirect-URLs für die gehostete Website eintragen.
2. Unter **Authentication → Providers → Email** entscheiden, ob E-Mail-Bestätigung aktiv sein soll. Wenn aktiv, E-Mail-Versand/SMTP für den Produktivbetrieb konfigurieren.
3. Die Passwort-Reset-Redirect-URL `passwort-zuruecksetzen.html` muss eingerichtet werden; die Reset-Seite wird im nächsten Schritt ergänzt.
4. Die Datenbank-Policies aus dem bereits ausgeführten SQL bleiben aktiv.
5. Der bisherige lokale Admin `admin@dhbw.de` / `Admin123` wird nicht übernommen. Nach Registrierung des gewünschten Admin-Kontos muss dessen Rolle einmalig im SQL-Editor von einem Projekt-Owner gesetzt werden:
   `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'DEINE-ADMIN-EMAIL');`

## Saubere Datenbasis
Bestehende `localStorage`-Daten werden nicht importiert. Benutzer registrieren sich neu. Die lokalen Anzeigen/Favoriten/Nachrichten bleiben zunächst nur im jeweiligen Browser, bis die betreffenden Seiten ebenfalls auf Supabase umgestellt sind.
