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
      status: row.status || "active"
    };
  }

  async function getListings(options) {
    const opts = options || {};
    const db = client();
    let query = db
      .from("anzeigen")
      .select("id,owner_id,title,price,tausch,kategorie,wohnheim,zustand,beschreibung,bilder,status,created_at,updated_at,profiles(display_name,wohnheim,avatar_url)")
      .order("created_at", { ascending: false });

    if (!opts.includeArchived) query = query.eq("status", "active");
    if (opts.ownerId) query = query.eq("owner_id", opts.ownerId);
    if (opts.id) query = query.eq("id", opts.id);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapListing);
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
      bilder: Array.isArray(listing.bilder) ? listing.bilder : [],
      status: listing.status || "active",
      updated_at: new Date().toISOString()
    };

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
    const { error } = await client().from("bewertungen").upsert({
      reviewer_id: user.id,
      reviewed_user_id: review.fuerId,
      anzeige_id: review.anzeigeId,
      sterne: Number(review.sterne),
      kommentar: String(review.kommentar || "").trim()
    }, { onConflict: "reviewer_id,anzeige_id" });
    if (error) throw error;
  }

  window.DHBWMarktData = {
    client, currentUser, getListings, saveListing, deleteListing,
    getFavorites, setFavorite, getMessages, sendMessage,
    markMessagesRead, getReviews, saveReview, mapListing
  };
})();
