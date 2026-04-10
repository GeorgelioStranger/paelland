// =================================================================
// LÓGICA DE GENERACIÓN DE TICKETS VIRTUALES Y PDFs PARA LA PAELLA
// =================================================================

function generarTicketPDF(pedido) {
    if (!pedido) return;

    // Configuración general
    const esVentaDirecta = pedido.tipo === 'venta_directa';
    const esEvento = pedido.tipo === 'evento';
    const tituloTipo = esVentaDirecta ? 'VENTA DE MOSTRADOR' : (esEvento ? 'PEDIDO EVENTO' : 'PEDIDO POR KILO');
    
    // Obtener detalles para construir filas
    let lineasHtml = '';
    
    // 1. Platillos principales
    if (pedido.itemsDetalle && Array.isArray(pedido.itemsDetalle)) {
        pedido.itemsDetalle.forEach(item => {
            if (pedido.tipo === 'evento' && item.personas) {
                lineasHtml += '<tr><td class="left">' + item.personas + ' personas ' + escapeHtml(item.nombre) + '</td><td class="right"></td></tr>';
            } else if (pedido.tipo === 'kilo' && item.cantidad > 0) {
                const k = (item.kilos || 0) * item.cantidad;
                lineasHtml += '<tr><td class="left">' + item.cantidad + 'x ' + escapeHtml(item.nombre) + ' (' + k + ' kg)</td><td class="right"></td></tr>';
            } else if ((pedido.tipo === 'venta_directa' || !pedido.tipo) && item.cantidad > 0) {
                const precio = item.precio_unitario || item.precio || 0;
                const sub = item.cantidad * precio;
                const subStr = sub > 0 ? '$' + sub.toLocaleString("es-MX") : '';
                lineasHtml += '<tr><td class="left">' + item.cantidad + 'x ' + escapeHtml(item.nombre) + '</td><td class="right">' + subStr + '</td></tr>';
            }
        });
    }

    // 2. Extras / Complementos
    if (pedido.extras && Array.isArray(pedido.extras)) {
        pedido.extras.forEach(ex => {
            if (ex.nombre && ex.cantidad > 0) {
                const precio = ex.precio || 0;
                const sub = ex.cantidad * precio;
                const subStr = sub > 0 ? '$' + sub.toLocaleString("es-MX") : '';
                lineasHtml += '<tr><td class="left" style="color: #555;">+ ' + ex.cantidad + 'x ' + escapeHtml(ex.nombre) + '</td><td class="right" style="color: #555;">' + subStr + '</td></tr>';
            }
        });
    }

    // 3. Envío / Traslado si aplica
    let trasladoHtml = '';
    let costoEnvio = 0;
    if (pedido.tipoEntrega === 'domicilio') {
        costoEnvio = (pedido.costoFijo || 30) + ((pedido.distancia && pedido.costoKm) ? (pedido.distancia * pedido.costoKm) : 0);
        if (costoEnvio > 0) {
            trasladoHtml = '<tr><td class="left">Envío Domicilio</td><td class="right">$' + costoEnvio.toLocaleString("es-MX") + '</td></tr>';
        }
    } else if (!esVentaDirecta) {
        trasladoHtml = '<tr><td class="left" colspan="2" style="font-size:12px; font-style:italic; text-align:center; padding-top:5px;">Recolección en Mostrador (Pick-up)</td></tr>';
    }

    // Formatear Fecha visualmente
    let fechaTxt = '';
    if (pedido.createdAt) {
        const fd = new Date(pedido.createdAt);
        fechaTxt = fd.toLocaleDateString("es-MX") + ' ' + fd.toLocaleTimeString("es-MX", {hour: '2-digit', minute:'2-digit'});
    } else if (pedido.fecha) {
        fechaTxt = new Date(pedido.fecha).toLocaleDateString("es-MX");
    } else {
        fechaTxt = new Date().toLocaleDateString("es-MX");
    }

    // Calcular un total
    const totalVenta = pedido.total || 0;
    const folioStr = pedido.id ? "#" + pedido.id : "#" + new Date().getTime().toString().slice(-6);
    
    let clienteHtml = '';
    if (pedido.nombre) {
        clienteHtml = '<div><span>Cliente:</span> <span>' + escapeHtml(pedido.nombre) + '</span></div>';
    }

    // Generar el bloque HTML
    const htmlTicket = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: sans-serif; margin: 0; padding: 0; display: flex; justify-content: center; background-color: #f3f4f6; }
        .ticket-container { width: 320px; background: #ffffff; padding: 30px; margin: 20px auto; box-shadow: 0px 5px 15px rgba(0,0,0,0.1); }
        .header-text { text-align: center; margin-bottom: 20px; }
        .header-text img { max-width: 140px; margin-bottom: 10px; }
        .header-text h1 { margin: 0; font-size: 26px; color: #D85A30; line-height: 1.1; font-weight: 800; }
        .header-text h1 span { color: #F5A623; }
        .header-text p { margin: 5px 0 0 0; font-size: 13px; color: #555; }
        .divider { border-top: 1px dashed #ccc; margin: 15px 0; }
        .meta-info { font-size: 13px; color: #333; margin-bottom: 15px; }
        .meta-info div { display: flex; justify-content: space-between; margin-bottom: 3px; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th { text-align: left; padding-bottom: 8px; border-bottom: 1px solid #ddd; font-size: 12px; color: #666; }
        td { padding: 6px 0; vertical-align: top; }
        .left { text-align: left; }
        .right { text-align: right; }
        .total-row { font-size: 18px; font-weight: bold; border-top: 2px solid #333; }
        .total-row td { padding-top: 10px; }
        .footer { text-align: center; margin-top: 30px; font-size: 14px; font-weight: bold; color: #333; }
        @media print { body { background-color: white; margin: 0; } .ticket-container { box-shadow: none; margin: 0; width: 100%; max-width: 80mm; padding: 5mm; } }
    </style>
</head>
<body>
    <div class="ticket-container">
        <div class="header-text">
            <img src="/logoPaelland.png" style="width: 140px; margin: 0 auto; display: block;" onerror="this.alt='Falta imagen logo.png en tu carpeta'" alt="La Paella Mérida">
            <p>Mérida, Yucatán</p>
        </div>
        <div class="meta-info">
            <div><span>F. Emisión:</span> <span>` + fechaTxt + `</span></div>
            <div><span>Folio:</span> <span>` + folioStr + `</span></div>
            <div><span>Tipo:</span> <span>` + tituloTipo + `</span></div>
            ` + clienteHtml + `
        </div>
        <div class="divider"></div>
        <table>
            <thead><tr><th class="left">CANT. / CONCEPTO</th><th class="right">IMPORTE</th></tr></thead>
            <tbody>
                ` + lineasHtml + `
                ` + trasladoHtml + `
            </tbody>
            <tfoot>
                <tr class="total-row">
                    <td class="left">TOTAL M.N.</td>
                    <td class="right">$` + totalVenta.toLocaleString("es-MX") + `</td>
                </tr>
            </tfoot>
        </table>
        <div class="divider"></div>
        <div class="footer">¡Gracias por tu preferencia!</div>
    </div>
</body>
</html>`;

    // Metodo Iframe oculto
    let iframe = document.getElementById('print-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe';
        iframe.style.position = 'absolute';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
    }
    
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlTicket);
    doc.close();

    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 500);
}

// Helper local por si escapeHtml no está expuesto
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
}
