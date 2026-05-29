/**
 * Stable HSL color from a book slug. Hue varies across slugs; saturation
 * and lightness are fixed so the palette stays visually coherent.
 */
export function bookColor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 60%, 55%)`;
}
