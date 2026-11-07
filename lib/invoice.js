import PDFDocument from "pdfkit";

const BRAND = "#831843";
const DARK = "#17211D";
const MUTED = "#6B756F";
const LIGHT = "#FAFAF7";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function paymentLabel(order) {
  if (order.paymentMethod === "cod") {
    return order.paymentStatus === "paid"
      ? "Cash on Delivery (Paid)"
      : "Cash on Delivery";
  }
  return order.paymentMethod ? order.paymentMethod.toUpperCase() : "—";
}

export function generateInvoicePdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const right = pageWidth - 50;

    doc.rect(0, 0, pageWidth, 120).fill(LIGHT);

    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(24)
      .text("JSS EliteShop", 50, 45);

    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text("Premium lifestyle essentials", 50, 74);

    doc
      .fillColor(DARK)
      .font("Helvetica-Bold")
      .fontSize(26)
      .text("INVOICE", 0, 45, { align: "right", width: right });

    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text(`Invoice #INV-${order.orderNumber}`, 0, 78, {
        align: "right",
        width: right,
      });

    const metaY = 145;

    doc.fillColor(MUTED).fontSize(8).font("Helvetica-Bold").text("BILL TO", 50, metaY);
    doc
      .fillColor(DARK)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(order.address?.name || "Customer", 50, metaY + 14);
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text(order.address?.phone || "", 50, metaY + 28)
      .text(order.address?.addressLine || "", 50, metaY + 41)
      .text(
        [order.address?.city, order.address?.postalCode].filter(Boolean).join(" "),
        50,
        metaY + 54
      );

    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("ORDER DETAILS", 330, metaY);
    doc.font("Helvetica").fontSize(9);
    doc.fillColor(MUTED).text("Order number:", 330, metaY + 14);
    doc.fillColor(DARK).text(order.orderNumber, 430, metaY + 14);
    doc.fillColor(MUTED).text("Order date:", 330, metaY + 28);
    doc.fillColor(DARK).text(formatDate(order.createdAt), 430, metaY + 28);
    doc.fillColor(MUTED).text("Payment:", 330, metaY + 42);
    doc.fillColor(DARK).text(paymentLabel(order), 430, metaY + 42);
    doc.fillColor(MUTED).text("Payment status:", 330, metaY + 56);
    doc
      .fillColor(DARK)
      .text(
        String(order.paymentStatus || "unpaid").replace(/^\w/, (c) => c.toUpperCase()),
        430,
        metaY + 56
      );

    const columns = {
      item: { x: 50, width: 230 },
      qty: { x: 290, width: 50, align: "right" },
      unit: { x: 350, width: 90, align: "right" },
      amount: { x: 450, width: 95, align: "right" },
    };

    const drawTableHeader = (y) => {
      doc.rect(50, y, right - 50, 22).fill(BRAND);
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9);
      doc.text("ITEM", columns.item.x + 8, y + 7, { width: columns.item.width - 8 });
      doc.text("QTY", columns.qty.x, y + 7, {
        width: columns.qty.width,
        align: columns.qty.align,
      });
      doc.text("UNIT PRICE", columns.unit.x, y + 7, {
        width: columns.unit.width,
        align: columns.unit.align,
      });
      doc.text("AMOUNT", columns.amount.x, y + 7, {
        width: columns.amount.width,
        align: columns.amount.align,
      });
      return y + 22;
    };

    let tableY = drawTableHeader(235);
    doc.font("Helvetica").fontSize(9);

    order.items.forEach((item, index) => {
      doc.font("Helvetica").fontSize(9);
      const nameHeight = doc.heightOfString(item.productName, {
        width: columns.item.width - 8,
      });
      const rowHeight = Math.max(30, nameHeight + 16);

      if (tableY + rowHeight > 720) {
        doc.addPage();
        tableY = drawTableHeader(50);
        doc.font("Helvetica").fontSize(9);
      }

      if (index % 2 === 1) {
        doc.rect(50, tableY, right - 50, rowHeight).fill("#FBF7F9");
      }

      doc.fillColor(DARK).text(item.productName, columns.item.x + 8, tableY + 8, {
        width: columns.item.width - 8,
      });
      doc
        .fillColor(MUTED)
        .text(String(item.quantity), columns.qty.x, tableY + 8, {
          width: columns.qty.width,
          align: columns.qty.align,
        })
        .fillColor(DARK)
        .text(money(item.unitPrice), columns.unit.x, tableY + 8, {
          width: columns.unit.width,
          align: columns.unit.align,
        })
        .text(money(item.totalPrice), columns.amount.x, tableY + 8, {
          width: columns.amount.width,
          align: columns.amount.align,
        });

      doc
        .moveTo(50, tableY + rowHeight)
        .lineTo(right, tableY + rowHeight)
        .strokeColor("#EEEEEE")
        .lineWidth(0.5)
        .stroke();

      tableY += rowHeight;
    });

    tableY += 16;

    if (tableY > 650) {
      doc.addPage();
      tableY = 60;
    }

    const totalsX = 330;
    const totalsWidth = right - totalsX;
    const totalsRows = [
      ["Subtotal", money(order.subtotal)],
      ["Shipping", Number(order.shipping) === 0 ? "Free" : money(order.shipping)],
      ["Discount", order.discount ? `-${money(order.discount)}` : money(0)],
    ];

    doc.font("Helvetica").fontSize(9);

    totalsRows.forEach(([label, value]) => {
      doc
        .fillColor(MUTED)
        .text(label, totalsX, tableY, { width: totalsWidth / 2 })
        .fillColor(DARK)
        .text(value, totalsX + totalsWidth / 2, tableY, {
          width: totalsWidth / 2,
          align: "right",
        });
      tableY += 16;
    });

    doc
      .moveTo(totalsX, tableY + 2)
      .lineTo(right, tableY + 2)
      .strokeColor("#DDDDDD")
      .lineWidth(0.5)
      .stroke();

    doc
      .fillColor(DARK)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("TOTAL", totalsX, tableY + 10, { width: totalsWidth / 2 })
      .text(money(order.total), totalsX + totalsWidth / 2, tableY + 10, {
        width: totalsWidth / 2,
        align: "right",
      });

    let noteY = tableY + 45;

    if (order.notes) {
      doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("ORDER NOTES", 50, noteY);
      doc
        .fillColor(DARK)
        .font("Helvetica")
        .fontSize(9)
        .text(order.notes, 50, noteY + 12, { width: 240 });
      noteY += 40;
    }

    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("DELIVER TO", 50, noteY);
    doc
      .fillColor(DARK)
      .font("Helvetica")
      .fontSize(9)
      .text(order.address?.addressLine || "", 50, noteY + 12, { width: 240 })
      .text(
        [order.address?.city, order.address?.postalCode].filter(Boolean).join(" "),
        50,
        noteY + 25
      );

    const footerY = doc.page.height - 60;
    doc
      .moveTo(50, footerY)
      .lineTo(right, footerY)
      .strokeColor("#EEEEEE")
      .lineWidth(0.5)
      .stroke();

    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(
        "Thank you for shopping with JSS EliteShop. For support, contact support@jsseliteshop.com.",
        50,
        footerY + 10,
        { width: right - 50, align: "center" }
      );

    doc.end();
  });
}
