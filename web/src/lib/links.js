/**
 * URL গঠনের একমাত্র উৎস।
 *
 * প্রতিটি জেলা ও গন্তব্যের একটি করে SEO-বান্ধব slug আছে (যেমন
 * /districts/dhaka, /places/lalbagh-fort)। পুরনো id-ভিত্তিক লিংক যাতে
 * না ভাঙে, তাই slug না থাকলে id-ই ব্যবহার হয়।
 */

/** জেলার পথ */
export function districtPath(district) {
  if (!district) return "/districts";
  return `/districts/${district.slug || district.id}`;
}

/** গন্তব্যের পথ */
export function placePath(place) {
  if (!place) return "/places";
  return `/places/${place.slug || place.id}`;
}

/**
 * জেলার id থেকে পথ — মানচিত্রের ক্লিক হ্যান্ডলার id পাঠায়,
 * তাই তালিকা থেকে জেলা খুঁজে slug বের করতে হয়।
 */
export function districtPathById(districts, id) {
  if (id == null) return "/districts";
  const found = (districts || []).find((d) => String(d.id) === String(id));
  return found ? districtPath(found) : `/districts/${id}`;
}

/** slug বা id থেকে গন্তব্য খোঁজে (PlacePage দুটোই গ্রহণ করে) */
export function findPlace(places, slugOrId) {
  if (!slugOrId) return null;
  const all = places || [];
  return all.find((p) => p.slug === slugOrId) || all.find((p) => String(p.id) === String(slugOrId)) || null;
}

/** slug বা id থেকে জেলা খোঁজে */
export function findDistrict(districts, slugOrId) {
  if (!slugOrId) return null;
  const all = districts || [];
  return all.find((d) => d.slug === slugOrId) || all.find((d) => String(d.id) === String(slugOrId)) || null;
}
