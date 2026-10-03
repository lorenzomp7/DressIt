// Generates the PWA icons from an inline SVG. Run with `npm run icons`.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const svg = (padding) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1f1b2e"/>
  <g transform="translate(${padding} ${padding + 30}) scale(${(512 - padding * 2) / 512})">
    <path d="M256 120c-22 0-40 18-40 40 0 8 6 14 14 14s14-6 14-14c0-7 5-12 12-12s12 5 12 12c0 10-6 15-16 21-9 6-10 9-10 19v12L92 314c-16 9-10 34 9 34h310c19 0 25-25 9-34L270 212v-4c0-2 1-3 4-5 14-9 22-22 22-43 0-22-18-40-40-40z"
      fill="none" stroke="#f5c26b" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
</svg>`;

await mkdir("public/icons", { recursive: true });
const targets = [
  ["public/icons/icon-192.png", 192, 40],
  ["public/icons/icon-512.png", 512, 40],
  ["public/icons/maskable-512.png", 512, 110],
  ["public/icons/apple-touch-icon.png", 180, 60],
];
for (const [file, size, padding] of targets) {
  await sharp(Buffer.from(svg(padding))).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
