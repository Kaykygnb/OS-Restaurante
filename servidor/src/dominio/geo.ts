export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function distanciaComFator(metros: number, fator: number) {
  const f = fator > 0 ? fator : 130;
  return Math.round(metros * (f / 100));
}

export function arredondarCoord(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}
