// =====================================================
//   SCHEDULER DE WHATSAPP — Sistema PAELLAND
//   Envío automático diario a las 3:30 PM (México)
//   Servicio: CallMeBot (gratuito)
// =====================================================

const cron = require('node-cron');
const https = require('https');
const { destinatarios } = require('./whatsapp-config');

// ── Nombres de meses en español ──
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

// ── Convertir "HH:MM" → "H:MM AM/PM" ──
function formatearHora(horaStr) {
  if (!horaStr || !horaStr.includes(':')) return 'Sin hora';
  const [hStr, mStr] = horaStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return horaStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mm = m.toString().padStart(2, '0');
  return `${h}:${mm} ${ampm}`;
}

// ── Fecha de mañana en formato YYYY-MM-DD ──
function getFechaMañana() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// ── Fecha legible en español: "25 de abril de 2026" ──
function formatearFechaEspanol(fechaStr) {
  const [anio, mes, dia] = fechaStr.split('-').map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

// ── Normalizar tipo de entrega ──
function formatearEntrega(tipoEntrega) {
  if (!tipoEntrega) return 'Sin especificar';
  const t = tipoEntrega.toLowerCase().trim();
  if (t === 'domicilio') return 'Domicilio';
  if (t === 'pickup') return 'Pickup';
  return tipoEntrega;
}

// ── Construir el mensaje completo ──
function construirMensaje(pedidos, fechaMañana) {
  const fechaTexto = formatearFechaEspanol(fechaMañana);

  // Separar por tipo
  const eventos = pedidos.filter(p => (p.tipo || '').toLowerCase() === 'evento');
  const kilos = pedidos.filter(p => (p.tipo || '').toLowerCase() === 'kilo');

  // Ordenar cada grupo por hora de entrega (ascendente)
  const ordenarPorHora = (a, b) => {
    const ha = a.horaEntrega || '00:00';
    const hb = b.horaEntrega || '00:00';
    return ha.localeCompare(hb);
  };
  eventos.sort(ordenarPorHora);
  kilos.sort(ordenarPorHora);

  const lineas = [];
  lineas.push(`Fecha: ${fechaTexto}`);

  // ── Sección Eventos ──
  if (eventos.length > 0) {
    lineas.push('');
    eventos.forEach(p => {
      const hora    = formatearHora(p.horaEntrega);
      const entrega = formatearEntrega(p.tipoEntrega || p.entrega);
      lineas.push(`${p.nombre} - ${hora} - ${entrega}`);

      // Detalles: solo paellas con personas > 0
      const items = Array.isArray(p.itemsDetalle) ? p.itemsDetalle : [];
      items.filter(i => i.personas > 0).forEach(i => {
        lineas.push(`   • ${i.nombre} - ${i.personas} personas`);
      });
      lineas.push('');
    });
  }

  // ── Sección Kilos ──
  if (kilos.length > 0) {
    kilos.forEach(p => {
      const hora    = formatearHora(p.horaEntrega);
      const entrega = formatearEntrega(p.tipoEntrega || p.entrega);
      lineas.push(`${p.nombre} - ${hora} - ${entrega}`);

      // Detalles: tipo de paella y cantidad en kilos
      const items = Array.isArray(p.itemsDetalle) ? p.itemsDetalle : [];
      items.filter(i => (i.kilos > 0 || i.cantidad > 0)).forEach(i => {
        const cantidad = i.kilos > 0 ? `${i.kilos} kg` : `${i.cantidad} kg`;
        lineas.push(`   • ${i.nombre} - ${cantidad}`);
      });
      lineas.push('');
    });
  }

  // ── Sin pedidos ──
  if (eventos.length === 0 && kilos.length === 0) {
    lineas.push('');
    lineas.push('No hay pedidos programados para mañana.');
  }

  lineas.push('');
  lineas.push('Buenas tardes, les adjunto los pedidos para el día de mañana, favor de revisar si falta algo, muchas gracias.');

  return lineas.join('\n');
}

// ── Enviar un mensaje vía CallMeBot ──
function enviarWhatsApp(telefono, apikey, mensaje) {
  return new Promise((resolve, reject) => {
    const textoEncoded = encodeURIComponent(mensaje);
    const telefonoLimpio = encodeURIComponent(telefono.trim());
    const url = `https://api.callmebot.com/whatsapp.php?phone=${telefonoLimpio}&text=${textoEncoded}&apikey=${apikey}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ [WhatsApp] Mensaje enviado a ${telefono}`);
          resolve(data);
        } else {
          console.error(`❌ [WhatsApp] Error HTTP ${res.statusCode} para ${telefono}: ${data}`);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', (err) => {
      console.error(`❌ [WhatsApp] Error de red para ${telefono}:`, err.message);
      reject(err);
    });
  });
}

// ── Función principal: consultar BD y enviar resumen ──
async function ejecutarResumenDiario(Pedido) {
  const fechaMañana = getFechaMañana();
  console.log(`\n📱 [WhatsApp Scheduler] Iniciando resumen para ${fechaMañana}...`);

  try {
    // Solo eventos y kilos (excluye venta_directa)
    const pedidos = await Pedido.find({
      fechaEntrega: fechaMañana,
      tipo: { $in: ['evento', 'kilo'] }
    });

    console.log(`📋 [WhatsApp Scheduler] ${pedidos.length} pedido(s) encontrado(s) para mañana.`);

    const mensaje = construirMensaje(pedidos, fechaMañana);

    console.log('\n──────── MENSAJE A ENVIAR ────────');
    console.log(mensaje);
    console.log('──────────────────────────────────\n');

    // Enviar a cada destinatario configurado
    for (const dest of destinatarios) {
      const esTelefonoPlaceholder = !dest.telefono || dest.telefono.includes('XXXXXXXXXX');
      const esApikeyPlaceholder = !dest.apikey || dest.apikey.includes('API_KEY');

      if (esTelefonoPlaceholder || esApikeyPlaceholder) {
        console.warn(`⚠️  [WhatsApp] Destinatario "${dest.nombre}" sin configurar. Edita whatsapp-config.js`);
        continue;
      }

      try {
        await enviarWhatsApp(dest.telefono, dest.apikey, mensaje);
        // Pausa de 2 s entre envíos para no saturar la API
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.error(`❌ [WhatsApp] Falló el envío a "${dest.nombre}": ${err.message}`);
      }
    }

    console.log('✅ [WhatsApp Scheduler] Proceso completado.\n');
  } catch (error) {
    console.error('❌ [WhatsApp Scheduler] Error inesperado:', error.message);
  }
}

// ── Iniciar el cron job y registrar el endpoint de prueba ──
function iniciarScheduler(app, Pedido) {
  // Cron: todos los días a las 15:30 (3:30 PM), zona horaria de México
  cron.schedule('30 15 * * *', () => {
    ejecutarResumenDiario(Pedido);
  }, {
    timezone: 'America/Mexico_City'
  });

  console.log('⏰ [WhatsApp Scheduler] Activo → envío automático todos los días a las 3:30 PM (CDMX)');

  // ── Endpoint de prueba: POST /whatsapp/test ──
  // Permite disparar el resumen manualmente desde el navegador o Postman
  // para verificar la configuración sin esperar las 3:30 PM
  app.post('/whatsapp/test', async (req, res) => {
    console.log('🧪 [WhatsApp Test] Envío de prueba solicitado...');
    try {
      await ejecutarResumenDiario(Pedido);
      res.json({ ok: true, mensaje: 'Resumen de prueba enviado. Revisa la consola del servidor para más detalles.' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}

module.exports = { iniciarScheduler, ejecutarResumenDiario };
