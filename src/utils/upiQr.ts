import qrcodeGenerator from 'qrcode-generator';
const qrcode = qrcodeGenerator;

/** Build an offline UPI QR as an SVG data URI (no network). */
export function buildUpiQrDataUri(upiPayload: string, cellSize = 3): string | null {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(upiPayload);
    qr.make();
    const count = qr.getModuleCount();
    const size = count * cellSize;
    let rects = '';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          rects += `<rect x="${col * cellSize}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}" fill="#0f3d2e"/>`;
        }
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${rects}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}
