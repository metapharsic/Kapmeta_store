// @ts-ignore
import escpos from 'escpos';
// @ts-ignore
import escposNetwork from 'escpos-network';
import type { KotLineInput } from '@kapmeta/shared-types/kitchen';

// Polyfill missing driver for network
(escpos as any).Network = escposNetwork;

export async function printKotTicket(
  printerIp: string,
  ticketNumber: string,
  lines: KotLineInput[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const device = new (escpos as any).Network(printerIp);
      const printer = new (escpos as any).Printer(device);

      device.open((err: any) => {
        if (err) {
          return reject(err);
        }

        printer
          .font('a')
          .align('ct')
          .style('b')
          .size(2, 2)
          .text('KOT TICKET')
          .text(ticketNumber)
          .text('--------------------------------')
          .align('lt')
          .size(1, 1);

        for (const line of lines) {
          const qty = line.quantity.toString().padEnd(4, ' ');
          // We only have menuItemId here, normally we'd fetch the name or pass it in
          const name = line.menuItemId.substring(0, 15).padEnd(16, ' ');
          printer.text(`${qty}${name}`);
          if (line.notes) {
            printer.text(`    NOTE: ${line.notes}`);
          }
        }

        printer
          .text('--------------------------------')
          .cut()
          .close();

        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}
