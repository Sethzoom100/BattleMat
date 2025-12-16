// src/utils/api.js
export const API_URL = 'https://battlemat.onrender.com'; // or http://localhost:3001

export const fetchCardData = async (cardName) => {
  if (!cardName) return null;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
    const data = await res.json();
    const getImages = (face) => ({ normal: face.image_uris?.normal, artCrop: face.image_uris?.art_crop });

    if (data.card_faces?.length > 1 && data.card_faces[0].image_uris) {
        const front = getImages(data.card_faces[0]);
        const back = getImages(data.card_faces[1]);
        return { name: data.name, image: front.normal, backImage: back.normal, artCrop: front.artCrop };
    }
    if (data.image_uris) {
        return { name: data.name, image: data.image_uris.normal, artCrop: data.image_uris.art_crop };
    }
    return null;
  } catch (err) { return null; }
};

export const fetchCommanderAutocomplete = async (text) => {
  if (text.length < 2) return [];
  try {
    const query = `name:/^${text}/ (t:legendary (t:creature OR t:vehicle) OR t:background) game:paper`;
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    return data.data ? data.data.map(card => card.name).slice(0, 10) : [];
  } catch (err) { return []; }
};

export const fetchAnyCardAutocomplete = async (text) => {
  if (text.length < 2) return [];
  try {
    const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(text)}`);
    const data = await res.json();
    return data.data || [];
  } catch (err) { return []; }
};
