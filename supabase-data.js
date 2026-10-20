/* Gemeinsame Datenzugriffe für DHBWMarkt.
 * Erwartet supabase-config.js und die Supabase-JS-v2-CDN-Bibliothek.
 * Der Browser verwendet ausschließlich den öffentlichen Publishable Key.
 */
(function () {
  "use strict";

  function client() {
    if (window.dhbwSupabase) return window.dhbwSupabase;
    if (!window.supabase || !window.DHBWMARKT_SUPABASE_URL || !window.DHBWMARKT_SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Supabase ist nicht initialisiert. Prüfe die Konfigurationsdateien.");
    }
    window.dhbwSupabase = window.supabase.createClient(
      window.DHBWMARKT_SUPABASE_URL,
      window.DHBWMARKT_SUPABASE_PUBLISHABLE_KEY
    );
    return window.dhbwSupabase;
  }

  async function currentUser() {
    const { data, error } = await client().auth.getUser();
    if (error) throw error;
    return data.user || null;
  }

  function mapListing(row) {
    const profile = row.profiles || {};
    const images = Array.isArray(row.bilder) ? row.bilder : [];
    return {
      id: row.id,
      ownerId: row.owner_id,
      ownerName: profile.display_name || "DHBWMarkt-Nutzer",
      ownerEmail: "",
      ownerAvatarUrl: profile.avatar_url || "",
      title: row.title || "",
      price: Number(row.price || 0),
      tausch: Boolean(row.tausch),
      kategorie: row.kategorie || "sonstiges",
      wohnheim: row.wohnheim || profile.wohnheim || "",
      zustand: row.zustand || "",
      beschreibung: row.beschreibung || "",
      bilder: images,
      bild: images[0] || "",
      erstelltAm: row.created_at,
      bearbeitetAm: row.updated_at,
      status: row.status || "aktiv"
    };
  }

  async function getListings(options) {
    const opts = options || {};
    const db = client();
    let query = db
      .from("anzeigen")
      .select("id,owner_id,title,price,tausch,kategorie,wohnheim,zustand,beschreibung,bilder,status,created_at,updated_at")
      .order("created_at", { ascending: false });

    if (!opts.includeArchived) query = query.eq("status", "aktiv");
    if (opts.ownerId) query = query.eq("owner_id", opts.ownerId);
    if (opts.id) query = query.eq("id", opts.id);

    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    const ownerIds = [...new Set(rows.map((row) => row.owner_id).filter(Boolean))];
    let profileMap = new Map();
    if (ownerIds.length) {
      const { data: profiles, error: profileError } = await db
        .from("profiles").select("id,display_name,wohnheim,avatar_url").in("id", ownerIds);
      if (profileError) {
        // Öffentliche Anzeigen sollen auch dann sichtbar bleiben, wenn Profil-Leserechte fehlen.
        console.warn("Verkäuferprofile konnten nicht öffentlich geladen werden:", profileError.message);
      } else {
        profileMap = new Map((profiles || []).map((profile) => [String(profile.id), profile]));
      }
    }
    return rows.map((row) => mapListing({ ...row, profiles: profileMap.get(String(row.owner_id)) || {} }));
  }

  async function uploadImageIfNeeded(dataUrl, folder) {
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return dataUrl || "";
    const user = await currentUser();
    if (!user) throw new Error("Bitte melde dich zuerst an.");
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) throw new Error("Bildformat nicht unterstützt. Bitte JPG, PNG oder WebP verwenden.");
    const mime = match[1];
    const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
    const path = user.id + "/" + folder + "-" + crypto.randomUUID() + "." + ext;
    const { error } = await client().storage.from("anzeigenbilder").upload(path, new Blob([bytes], { type: mime }), {
      contentType: mime, upsert: false
    });
    if (error) throw new Error("Bild-Upload fehlgeschlagen. Prüfe den Bucket 'anzeigenbilder' und seine Policies: " + error.message);
    return client().storage.from("anzeigenbilder").getPublicUrl(path).data.publicUrl;
  }

  async function saveListing(listing, existingId) {
    const db = client();
    const user = await currentUser();
    if (!user) throw new Error("Bitte melde dich zuerst an.");

    const row = {
      owner_id: user.id,
      title: String(listing.title || "").trim(),
      price: Number(listing.price || 0),
      tausch: Boolean(listing.tausch),
      kategorie: listing.kategorie || "sonstiges",
      wohnheim: listing.wohnheim || "",
      zustand: listing.zustand || "",
      beschreibung: listing.beschreibung || "",
      bilder: await Promise.all((Array.isArray(listing.bilder) ? listing.bilder : []).map((image, index) => uploadImageIfNeeded(image, "anzeige-" + index))),
      status: listing.status || "aktiv",
      updated_at: new Date().toISOString()
    };

    listing.bilder = row.bilder;
    listing.bild = row.bilder[0] || "";
    let result;
    if (existingId) {
      const { data, error } = await db.from("anzeigen")
        .update(row).eq("id", existingId).eq("owner_id", user.id)
        .select("id").single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await db.from("anzeigen")
        .insert(row).select("id").single();
      if (error) throw error;
      result = data;
    }
    return result.id;
  }

  async function deleteListing(id) {
    const user = await currentUser();
    if (!user) throw new Error("Bitte melde dich zuerst an.");
    const { error } = await client().from("anzeigen")
      .delete().eq("id", id).eq("owner_id", user.id);
    if (error) throw error;
  }

  async function getFavorites() {
    const user = await currentUser();
    if (!user) return [];
    const { data, error } = await client().from("favoriten")
      .select("anzeige_id").eq("user_id", user.id);
    if (error) throw error;
    return (data || []).map((row) => String(row.anzeige_id));
  }

  async function setFavorite(listingId, isFavorite) {
    const user = await currentUser();
    if (!user) throw new Error("Bitte melde dich an, um Favoriten zu speichern.");
    const db = client();
    if (isFavorite) {
      const { error } = await db.from("favoriten")
        .upsert({ user_id: user.id, anzeige_id: listingId }, { onConflict: "user_id,anzeige_id" });
      if (error) throw error;
    } else {
      const { error } = await db.from("favoriten")
        .delete().eq("user_id", user.id).eq("anzeige_id", listingId);
      if (error) throw error;
    }
  }

  async function getMessages() {
    const user = await currentUser();
    if (!user) return [];
    const { data, error } = await client().from("nachrichten")
      .select("id,anzeige_id,sender_id,recipient_id,text,gelesen,created_at")
      .or("sender_id.eq." + user.id + ",recipient_id.eq." + user.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      anzeigeId: row.anzeige_id,
      vonId: row.sender_id,
      anId: row.recipient_id,
      text: row.text,
      gelesen: row.gelesen,
      zeit: row.created_at
    }));
  }

  async function sendMessage(listingId, recipientId, text) {
    const user = await currentUser();
    if (!user) throw new Error("Bitte melde dich zuerst an.");
    const cleanText = String(text || "").trim();
    if (!cleanText) throw new Error("Die Nachricht darf nicht leer sein.");
    const { error } = await client().from("nachrichten").insert({
      anzeige_id: listingId,
      sender_id: user.id,
      recipient_id: recipientId,
      text: cleanText
    });
    if (error) throw error;
  }

  async function deleteConversation(listingId, partnerId) {
    const user = await currentUser();
    if (!user) throw new Error("Bitte melde dich erneut an.");
    if (!listingId || !partnerId || String(partnerId) === String(user.id)) {
      throw new Error("Das Gespräch ist ungültig.");
    }
    const { data, error } = await client().rpc("delete_chat_conversation", {
      p_listing_id: String(listingId),
      p_partner_id: String(partnerId)
    });
    if (error) throw error;
    if (data !== true) throw new Error("Das Gespräch konnte nicht gefunden werden.");
    const cached = JSON.parse(localStorage.getItem("nachrichten") || "[]");
    localStorage.setItem("nachrichten", JSON.stringify(
      (Array.isArray(cached) ? cached : []).filter((message) =>
        !(String(message.anzeigeId) === String(listingId) &&
          [String(message.vonId), String(message.anId)].includes(String(partnerId)) &&
          [String(message.vonId), String(message.anId)].includes(String(user.id)))
    ));
    return true;
  }

  async function markMessagesRead(listingId, senderId) {
    const user = await currentUser();
    if (!user) return;
    const { error } = await client().from("nachrichten").update({ gelesen: true })
      .eq("anzeige_id", listingId).eq("sender_id", senderId)
      .eq("recipient_id", user.id);
    if (error) throw error;
  }

  async function getReviews(reviewedUserId) {
    let query = client().from("bewertungen")
      .select("id,reviewer_id,reviewed_user_id,anzeige_id,sterne,kommentar,created_at")
      .order("created_at", { ascending: false });
    if (reviewedUserId) query = query.eq("reviewed_user_id", reviewedUserId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      vonId: row.reviewer_id,
      fuerId: row.reviewed_user_id,
      anzeigeId: row.anzeige_id,
      sterne: row.sterne,
      kommentar: row.kommentar,
      erstelltAm: row.created_at
    }));
  }

  async function saveReview(review) {
    const user = await currentUser();
    if (!user) throw new Error("Bitte melde dich zuerst an.");

    const db = client();
    const values = {
      reviewer_id: user.id,
      reviewed_user_id: review.fuerId,
      anzeige_id: review.anzeigeId,
      sterne: Number(review.sterne),
      kommentar: String(review.kommentar || "").trim()
    };

    // Nicht upsert/onConflict verwenden: Die bestehende Datenbank hat
    // offenbar keinen passenden UNIQUE-Constraint auf reviewer_id + anzeige_id.
    // Stattdessen vorhandene Bewertung suchen und aktualisieren, sonst neu anlegen.
    const { data: existing, error: lookupError } = await db
      .from("bewertungen")
      .select("id")
      .eq("reviewer_id", user.id)
      .eq("anzeige_id", review.anzeigeId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing) {
      const { error } = await db.from("bewertungen")
        .update({
          reviewed_user_id: values.reviewed_user_id,
          sterne: values.sterne,
          kommentar: values.kommentar
        })
        .eq("id", existing.id)
        .eq("reviewer_id", user.id);
      if (error) throw error;
    } else {
      const { error } = await db.from("bewertungen").insert(values);
      if (error) throw error;
    }
  }


  async function deleteReview(reviewId, isAdmin) {
    const user = await currentUser();
    if (!user) throw new Error("Bitte melde dich erneut an.");
    if (!reviewId) throw new Error("Die Bewertung hat keine gültige ID.");

    const db = client();
    if (isAdmin) {
      // Die RPC prüft die Admin-Rolle serverseitig in profiles.
      const { data, error } = await db.rpc("admin_delete_review", {
        p_review_id: String(reviewId)
      });
      if (error) throw error;
      if (data !== true) throw new Error("Die Bewertung wurde nicht gefunden oder bereits gelöscht.");
    } else {
      // Normale Nutzer dürfen nur ihre eigene Bewertung löschen.
      const { data, error } = await db.from("bewertungen")
        .delete()
        .eq("id", reviewId)
        .eq("reviewer_id", user.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Du kannst nur deine eigenen Bewertungen löschen.");
      }
    }

    const cached = JSON.parse(localStorage.getItem("bewertungen") || "[]");
    localStorage.setItem("bewertungen", JSON.stringify(
      (Array.isArray(cached) ? cached : []).filter((review) => String(review.id) !== String(reviewId))
    ));
  }

  async function bootstrapCache() {
    const db = client();

    // Öffentliche Anzeigen zuerst laden. Authentifizierungsprüfungen dürfen
    // das Anzeigen der öffentlichen Startseite niemals blockieren.
    const listings = await getListings();
    localStorage.setItem("anzeigen", JSON.stringify(listings));

    let user = null;
    try {
      user = await currentUser();
    } catch (authError) {
      // Fehlende oder abgelaufene Sitzung bedeutet für die Startseite:
      // Besucher ohne Anmeldung. Öffentliche Anzeigen bleiben sichtbar.
      console.warn("Keine aktive Anmeldung; öffentliche Anzeigen bleiben verfügbar.", authError);
    }

    if (!user) {
      localStorage.removeItem("loggedInUser");
      localStorage.setItem("nachrichten", "[]");
      localStorage.setItem("bewertungen", "[]");
      return null;
    }

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id,display_name,wohnheim,avatar_url,role")
      .eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;

    const loggedInUser = {
      id: user.id,
      name: profile?.display_name || user.user_metadata?.display_name || user.email,
      email: user.email,
      wohnheim: profile?.wohnheim || user.user_metadata?.wohnheim || "",
      role: profile?.role || "user",
      profileImage: profile?.avatar_url || ""
    };
    localStorage.setItem("loggedInUser", JSON.stringify(loggedInUser));
    localStorage.setItem("registeredUsers", JSON.stringify([{
      ...loggedInUser, profileImage: loggedInUser.profileImage
    }]));

    // Nutzerspezifische Daten erst nach erfolgreicher Anmeldung laden.
    const [favorites, messages, reviews, profileResult] = await Promise.all([
      getFavorites(),
      getMessages(),
      getReviews(),
      db.from("profiles").select("id,display_name,avatar_url")
    ]);
    localStorage.setItem("favoriten-" + user.id, JSON.stringify(favorites));

    const profileById = new Map(
      ((profileResult && !profileResult.error && profileResult.data) || [])
        .map((item) => [String(item.id), item])
    );
    const listingById = new Map(listings.map((item) => [String(item.id), item]));
    const mappedMessages = messages.map((message) => {
      const listing = listingById.get(String(message.anzeigeId)) || {};
      const sender = profileById.get(String(message.vonId)) || {};
      const recipient = profileById.get(String(message.anId)) || {};
      const participantIds = [String(message.vonId), String(message.anId)].sort();
      return {
        ...message,
        konversationId: String(message.anzeigeId) + "|" + participantIds.join("|"),
        anzeigeTitel: listing.title || "Anzeige",
        vonName: sender.display_name || (String(message.vonId) === user.id ? loggedInUser.name : "DHBWMarkt-Nutzer"),
        anName: recipient.display_name || (String(message.anId) === user.id ? loggedInUser.name : "DHBWMarkt-Nutzer"),
        gelesen: Boolean(message.gelesen)
      };
    });
    localStorage.setItem("nachrichten", JSON.stringify(mappedMessages));

    localStorage.setItem("bewertungen", JSON.stringify(reviews.map((r) => ({
      id: r.id, verkaeuferId: r.fuerId, bewerterId: r.vonId,
      sterne: r.sterne, kommentar: r.kommentar, erstelltAm: r.erstelltAm
    }))));
    return loggedInUser;
  }

  async function updateProfile(fields) {
    const user = await currentUser();
    if (!user) throw new Error("Bitte melde dich erneut an.");
    const patch = {};
    if (fields.name !== undefined) patch.display_name = String(fields.name).trim();
    if (fields.wohnheim !== undefined) patch.wohnheim = String(fields.wohnheim);
    if (fields.avatar_url !== undefined) patch.avatar_url = await uploadImageIfNeeded(String(fields.avatar_url), "profilbild");
    if (Object.keys(patch).length) {
      const { error } = await client().from("profiles").update(patch).eq("id", user.id);
      if (error) throw error;
    }
    if (fields.email && fields.email !== user.email) {
      const { error } = await client().auth.updateUser({ email: fields.email });
      if (error) throw error;
    }
    return bootstrapCache();
  }

  async function changePassword(password) {
    const { error } = await client().auth.updateUser({ password });
    if (error) throw error;
  }

  async function deleteOwnAccount() {
    throw new Error("Konten können aus Sicherheitsgründen nicht direkt aus dem Browser gelöscht werden. Bitte nutze den sicheren Kontolöschungsprozess des Betreibers.");
  }

  window.DHBWMarktData = {
    client, currentUser, getListings, saveListing, deleteListing,
    getFavorites, setFavorite, getMessages, sendMessage,
    markMessagesRead, deleteConversation, getReviews, saveReview, deleteReview, mapListing,
    bootstrapCache, updateProfile, changePassword, deleteOwnAccount
  };
})();
