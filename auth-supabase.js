"use strict";

(function () {
  const url = window.DHBWMARKT_SUPABASE_URL;
  const key = window.DHBWMARKT_SUPABASE_PUBLISHABLE_KEY;
  if (!window.supabase || !url || !key) {
    console.error("Supabase ist nicht geladen. Prüfe supabase-config.js und die CDN-Verbindung.");
    return;
  }
  const db = window.supabase.createClient(url, key);
  window.dhbwSupabase = db;

  const $ = (id) => document.getElementById(id);
  const loginForm = $("loginForm");
  const registerForm = $("registerForm");
  const resetForm = $("resetForm");
  const loginEmail = $("loginEmail");
  const loginPassword = $("loginPassword");
  const registerName = $("registerName");
  const registerEmail = $("registerEmail");
  const registerPassword = $("registerPassword");
  const confirmPassword = $("confirmPassword");
  const wohnheimSelect = $("wohnheim");
  const loginStatus = $("loginStatusMessage");
  const registerStatus = $("registerStatusMessage");
  const resetStatus = $("resetStatusMessage");
  const formHeading = $("formHeading");
  const formIntro = $("formIntro");
  const switchText = $("switchText");
  const switchLink = $("switchFormLink");
  const WOHNHEIME = [
    "Kein Wohnheim / außerhalb eines Wohnheims",
    "Am Verbindungskanal – Hafenstraße 35–45, 68159 Mannheim",
    "Augartenstraße – Augartenstraße 112–114, 68165 Mannheim",
    "B 6 – B 6, 14–15, 68159 Mannheim",
    "B 7 – B 7, 14–15, 68159 Mannheim",
    "Carl-Zuckmayer-Straße – Carl-Zuckmayer-Straße 13–17, 68169 Mannheim",
    "Eastsite – Seckenheimer Landstraße 4a, 68163 Mannheim",
    "G 7 – G 7, 26–28, 68159 Mannheim",
    "Hans-Sachs-Ring / Steubenstraße – Hans-Sachs-Ring 1–5 und Steubenstraße 80, 68199 Mannheim",
    "L 8 – L 8, 13–14, 68161 Mannheim",
    "Neckarauer Straße – Neckarauer Straße 169–175, 68199 Mannheim",
    "Parkring – Parkring 21, 68159 Mannheim",
    "Studentensiedlung Ludwig Frank – Ulmenweg 55, 68167 Mannheim",
    "Speyerer Straße – Speyerer Straße 39–57, 68199 Mannheim",
    "N 6 / Hermann-Heimerich-Haus – N 6, 8, 68161 Mannheim"
  ];

  if (wohnheimSelect && !wohnheimSelect.options.length) {
    WOHNHEIME.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      wohnheimSelect.appendChild(option);
    });
  }

  function status(el, message, good) {
    if (!el) return;
    el.textContent = message || "";
    el.style.color = good ? "green" : "red";
  }

  function showMode(mode) {
    if (loginForm) loginForm.hidden = mode !== "login";
    if (registerForm) registerForm.hidden = mode !== "register";
    if (resetForm) resetForm.hidden = mode !== "reset";
    const codeBox = $("codeBox");
    if (codeBox) codeBox.hidden = true;
    const switchRow = $("switchRow");
    if (switchRow) switchRow.hidden = mode === "reset";
    if (formHeading) formHeading.textContent =
      mode === "register" ? "Registrieren" :
      mode === "reset" ? "Passwort zurücksetzen" : "Anmelden";
    if (formIntro) formIntro.textContent =
      mode === "register" ? "Erstelle ein Konto für den DHBW-Marktplatz." :
      mode === "reset" ? "Du erhältst einen Link per E-Mail, um dein Passwort zurückzusetzen." :
      "Melde dich an, um den DHBW-Marktplatz zu nutzen.";
    if (switchText) switchText.textContent = mode === "register" ? "Bereits registriert?" : "Noch kein Konto?";
    if (switchLink) switchLink.textContent = mode === "register" ? "Jetzt anmelden" : "Jetzt registrieren";
  }

  if (switchLink) switchLink.addEventListener("click", (event) => {
    event.preventDefault();
    status(loginStatus, "");
    status(registerStatus, "");
    showMode(registerForm && !registerForm.hidden ? "login" : "register");
  });

  const showPass = $("showLoginPasswordButton");
  if (showPass && loginPassword) showPass.addEventListener("click", () => {
    const hidden = loginPassword.type === "password";
    loginPassword.type = hidden ? "text" : "password";
    showPass.textContent = hidden ? "Ausblenden" : "Anzeigen";
  });

  const forgot = $("forgotLink");
  if (forgot) forgot.addEventListener("click", (event) => {
    event.preventDefault();
    status(loginStatus, "");
    showMode("reset");
  });
  const back = $("backToLogin");
  if (back) back.addEventListener("click", (event) => {
    event.preventDefault();
    showMode("login");
  });

  if (registerForm) registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = registerName.value.trim();
    const email = registerEmail.value.trim().toLowerCase();
    const password = registerPassword.value;
    const confirmation = confirmPassword.value;
    const wohnheim = wohnheimSelect.value;
    status(registerStatus, "");
    if (name.length < 2) return status(registerStatus, "Bitte gib deinen Namen ein.");
    if (password.length < 8) return status(registerStatus, "Bitte nutze ein Passwort mit mindestens 8 Zeichen.");
    if (password !== confirmation) return status(registerStatus, "Die Passwörter stimmen nicht überein.");
    const button = registerForm.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      const { data, error } = await db.auth.signUp({
        email, password,
        options: { data: { display_name: name, wohnheim } }
      });
      if (error) throw error;
      registerForm.reset();
      if (data.session) {
        status(registerStatus, "Registrierung erfolgreich. Du wirst weitergeleitet.", true);
        await syncProfile(data.user);
        setTimeout(() => { window.location.href = "index.html"; }, 700);
      } else {
        status(registerStatus, "Registrierung angelegt. Bitte bestätige deine E-Mail-Adresse über den Link in deinem Postfach.", true);
        showMode("login");
      }
    } catch (error) {
      status(registerStatus, error.message || "Registrierung fehlgeschlagen.");
    } finally {
      if (button) button.disabled = false;
    }
  });

  async function syncProfile(user) {
    if (!user) return null;
    let profile = null;
    const result = await db.from("profiles")
      .select("id,display_name,wohnheim,avatar_url,role")
      .eq("id", user.id).maybeSingle();
    if (result.error) throw result.error;
    profile = result.data;
    const currentUser = {
      id: user.id,
      name: profile?.display_name || user.user_metadata?.display_name || user.email,
      email: user.email,
      wohnheim: profile?.wohnheim || user.user_metadata?.wohnheim || "",
      role: profile?.role || "user",
      profileImage: profile?.avatar_url || ""
    };
    localStorage.setItem("loggedInUser", JSON.stringify(currentUser));
    return currentUser;
  }

  if (loginForm) loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    status(loginStatus, "");
    const button = loginForm.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      const { data, error } = await db.auth.signInWithPassword({
        email: loginEmail.value.trim().toLowerCase(),
        password: loginPassword.value
      });
      if (error) throw error;
      await syncProfile(data.user);
      status(loginStatus, "Anmeldung erfolgreich.", true);
      setTimeout(() => { window.location.href = "index.html"; }, 500);
    } catch (error) {
      status(loginStatus, error.message === "Invalid login credentials"
        ? "E-Mail-Adresse oder Passwort ist falsch."
        : (error.message || "Anmeldung fehlgeschlagen."));
    } finally {
      if (button) button.disabled = false;
    }
  });

  if (resetForm) resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("resetEmail")?.value.trim().toLowerCase();
    if (!email) return status(resetStatus, "Bitte gib deine E-Mail-Adresse ein.");
    try {
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: new URL("passwort-zuruecksetzen.html", window.location.href).href
      });
      if (error) throw error;
      status(resetStatus, "Wenn ein Konto mit dieser Adresse existiert, wurde ein Link zum Zurücksetzen versendet.", true);
    } catch (error) {
      status(resetStatus, error.message || "Der Link konnte nicht angefordert werden.");
    }
  });

  const logout = async () => {
    await db.auth.signOut();
    localStorage.removeItem("loggedInUser");
  };
  window.dhbwLogout = logout;

  db.auth.getSession().then(async ({ data, error }) => {
    if (error) console.error(error);
    if (data?.session?.user) {
      try { await syncProfile(data.session.user); } catch (e) { console.error("Profil konnte nicht geladen werden:", e); }
    }
  });
})();
