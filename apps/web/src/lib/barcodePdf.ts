/**
 * Downloads a PDF with a barcode for the given order number.
 * Uses JsBarcode + jsPDF (both loaded from CDN on first call).
 */

async function loadScript(src: string) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function downloadBarcodePdf(params: {
  orderId: string;
  invNo: number;
  market: string;
  storeCode: string;
  dateIso: string;
}) {
  const { orderId, invNo, market, storeCode, dateIso } = params;

  await loadScript('https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');

  // Generate barcode on canvas
  const canvas = document.createElement('canvas');
  (window as any).JsBarcode(canvas, orderId, {
    format: 'CODE128',
    width: 3,
    height: 80,
    displayValue: true,
    fontSize: 16,
    margin: 12,
    background: '#ffffff',
    lineColor: '#000000',
  });

  const barcodeDataUrl = canvas.toDataURL('image/png');

  // Create PDF (80mm x 50mm label size)
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF({ unit: 'mm', format: [80, 50] });

  // Header info
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`№ ${invNo}  ·  ${storeCode}  ${market}`, 40, 6, { align: 'center' });
  doc.text(dateIso, 40, 10, { align: 'center' });

  // Barcode image
  const imgW = 70;
  const imgH = (canvas.height / canvas.width) * imgW;
  doc.addImage(barcodeDataUrl, 'PNG', 5, 13, imgW, imgH);

  doc.save(`barcode-${invNo}-${orderId}.pdf`);
}
