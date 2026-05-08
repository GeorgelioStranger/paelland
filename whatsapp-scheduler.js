// =====================================================
//   SCHEDULER DE WHATSAPP — Sistema PAELLAND
//   Envío automático diario a las 3:30 PM (México)
//   Servicio: Baileys
// =====================================================

const cron = require('node-cron');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { grupos } = require('./whatsapp-config');

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

function getFechaEnMexico(offsetDias = 0) {
  const ahoraEnMexico = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  ahoraEnMexico.setDate(ahoraEnMexico.getDate() + offsetDias);
  const anio = ahoraEnMexico.getFullYear();
  const mes  = String(ahoraEnMexico.getMonth() + 1).padStart(2, '0');
  const dia  = String(ahoraEnMexico.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function getFechaMañana() { return getFechaEnMexico(1); }
function getFechaHoy()    { return getFechaEnMexico(0); }

function formatearFechaEspanol(fechaStr) {
  const [anio, mes, dia] = fechaStr.split('-').map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

function formatearEntrega(tipoEntrega) {
  if (!tipoEntrega) return 'Sin especificar';
  const t = tipoEntrega.toLowerCase().trim();
  if (t === 'domicilio') return 'Domicilio';
  if (t === 'pickup') return 'Pickup';
  return tipoEntrega;
}

function construirMensaje(pedidos, fechaMañana) {
  const fechaTextoHoy = formatearFechaEspanol(getFechaHoy());
  const fechaTextoManana = formatearFechaEspanol(fechaMañana);

  const eventos = pedidos.filter(p => (p.tipo || '').toLowerCase() === 'evento');
  const kilos = pedidos.filter(p => (p.tipo || '').toLowerCase() === 'kilo');

  const ordenarPorHora = (a, b) => {
    const ha = a.horaEntrega || '00:00';
    const hb = b.horaEntrega || '00:00';
    return ha.localeCompare(hb);
  };
  eventos.sort(ordenarPorHora);
  kilos.sort(ordenarPorHora);

  const lineas = [];
  lineas.push(`Fecha: ${fechaTextoHoy}`);

  if (eventos.length === 0 && kilos.length === 0) {
    lineas.push('');
    lineas.push(`No hay pedidos programados para mañana (${fechaTextoManana}).`);
  } else {
    lineas.push('');
    lineas.push(`Pedidos programados para mañana (${fechaTextoManana}):`);

    if (eventos.length > 0) {
      lineas.push('');
      eventos.forEach(p => {
        const hora    = formatearHora(p.horaEntrega);
        const entrega = formatearEntrega(p.tipoEntrega || p.entrega);
        lineas.push(`${p.nombre} - ${hora} - ${entrega}`);

        const items = Array.isArray(p.itemsDetalle) ? p.itemsDetalle : [];
        items.filter(i => i.personas > 0).forEach(i => {
          lineas.push(`   • ${i.nombre} - ${i.personas} personas`);
        });
        lineas.push('');
      });
    }

    if (kilos.length > 0) {
      if (eventos.length === 0) lineas.push('');
      kilos.forEach(p => {
        const hora    = formatearHora(p.horaEntrega);
        const entrega = formatearEntrega(p.tipoEntrega || p.entrega);
        lineas.push(`${p.nombre} - ${hora} - ${entrega}`);

        const items = Array.isArray(p.itemsDetalle) ? p.itemsDetalle : [];
        items.filter(i => i.cantidad > 0).forEach(i => {
          const totalKg = i.cantidad * (i.kilos || 0);
          const suffix = totalKg > 0 ? ` (${totalKg} kg)` : '';
          lineas.push(`   • ${i.nombre} × ${i.cantidad}${suffix}`);
        });
        lineas.push('');
      });
    }
  }

  lineas.push('Buenas tardes, les adjunto los pedidos para el día de mañana, favor de revisar si falta algo, muchas gracias.');

  return lineas.join('\n');
}

let sock = null;
let isWhatsAppReady = false;
let isWaitingForQR = false;
let lastError = null;

async function ejecutarResumenDiario(Pedido) {
  const fechaMañana = getFechaMañana();
  console.log(`\n📱 [WhatsApp Scheduler] Iniciando resumen para ${fechaMañana}...`);

  if (!isWhatsAppReady || !sock) {
    console.error('❌ [WhatsApp] El cliente de WhatsApp no está listo. No se puede enviar el resumen.');
    return;
  }

  try {
    const pedidos = await Pedido.find({
      fechaEntrega: fechaMañana,
      tipo: { $in: ['evento', 'kilo'] }
    });

    console.log(`📋 [WhatsApp Scheduler] ${pedidos.length} pedido(s) encontrado(s) para mañana.`);

    const mensaje = construirMensaje(pedidos, fechaMañana);

    console.log('\n──────── MENSAJE A ENVIAR ────────');
    console.log(mensaje);
    console.log('──────────────────────────────────\n');

    for (const grupo of grupos) {
      if (!grupo.activo || !grupo.id || grupo.id.includes('XXXXXXXXX')) {
        console.warn(`⚠️  [WhatsApp] Grupo "${grupo.nombre}" sin configurar o inactivo. Edita whatsapp-config.js`);
        continue;
      }

      try {
        await sock.sendMessage(grupo.id, { text: mensaje });
        console.log(`✅ [WhatsApp] Mensaje enviado al grupo: ${grupo.nombre}`);
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.error(`❌ [WhatsApp] Falló el envío al grupo "${grupo.nombre}": ${err.message}`);
      }
    }

    console.log('✅ [WhatsApp Scheduler] Proceso completado.\n');
  } catch (error) {
    console.error('❌ [WhatsApp Scheduler] Error inesperado:', error.message);
  }
}

async function iniciarBaileys() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`[WhatsApp] Usando versión de WhatsApp v${version.join('.')}, isLatest: ${isLatest}`);
        
        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.ubuntu('Chrome'),
            syncFullHistory: false
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                isWaitingForQR = true;
                isWhatsAppReady = false;
                console.log('\n======================================================');
                console.log('📸 ¡ATENCIÓN! ESCANEA EL SIGUIENTE CÓDIGO QR CON WHATSAPP:');
                console.log('======================================================\n');
                qrcode.generate(qr, { small: true });
                console.log('\n======================================================');
            }

            if (connection === 'close') {
                isWhatsAppReady = false;
                isWaitingForQR = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errMsg = lastDisconnect?.error?.message || String(lastDisconnect?.error);
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`❌ [WhatsApp] Conexión cerrada. Code: ${statusCode}. Error: ${errMsg}. Reconectando: ${shouldReconnect}`);
                if (shouldReconnect) {
                    setTimeout(() => iniciarBaileys(), 3000); // Wait 3s to prevent spam loops
                } else {
                    lastError = 'Desconectado permanentemente (LOGOUT). Borra la carpeta baileys_auth_info para escanear de nuevo.';
                    console.error('❌ [WhatsApp] LOGOUT de Baileys');
                }
            } else if (connection === 'open') {
                isWhatsAppReady = true;
                isWaitingForQR = false;
                lastError = null;
                console.log('\n✅ [WhatsApp] ¡Cliente Baileys listo y conectado!');
            }
        });
    } catch (err) {
        lastError = 'Error fatal iniciando Baileys: ' + err.message;
        console.error('❌ [WhatsApp] Error global en iniciarBaileys:', err);
    }
}

async function iniciarScheduler(app, Pedido) {
  iniciarBaileys();

  cron.schedule('0 14,19 * * *', () => {
    ejecutarResumenDiario(Pedido);
  }, {
    timezone: 'America/Mexico_City'
  });

  console.log('⏰ [WhatsApp Scheduler] Activo → envío automático todos los días a las 2:00 PM y 7:00 PM (CDMX)');

  app.all('/whatsapp/test', async (req, res) => {
    console.log('🧪 [WhatsApp Test] Envío de prueba solicitado...');
    if (!isWhatsAppReady) {
      if (isWaitingForQR) {
        return res.status(503).json({ ok: false, error: '⚠️ WhatsApp te pide escanear el QR. Ve a tu Dashboard de Render -> Logs, allí está el código QR esperándote.' });
      }
      return res.status(503).json({ ok: false, error: lastError ? `Error de WhatsApp: ${lastError}` : 'El servidor en la nube no pudo arrancar WhatsApp.' });
    }
    try {
      await ejecutarResumenDiario(Pedido);
      res.json({ ok: true, mensaje: 'Resumen de prueba enviado. Revisa la consola.' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get('/whatsapp/chats', async (req, res) => {
    if (!isWhatsAppReady || !sock) {
      return res.status(503).json({ error: 'WhatsApp aún no está listo. Revisa la consola del servidor y escanea el código QR primero.' });
    }
    try {
      const groups = await sock.groupFetchAllParticipating();
      const gruposChats = Object.values(groups).map(g => ({
        nombre: g.subject,
        id: g.id
      }));
      res.json({ grupos: gruposChats });
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener chats', detalle: error.message });
    }
  });
}

async function enviarPDFCliente(telefono, mensajeTexto, pdfBuffer, nombreCliente) {
  if (!isWhatsAppReady || !sock) {
    throw new Error('WhatsApp no está listo');
  }

  const numero = telefono.replace(/\D/g, '');
  if (!numero) {
    throw new Error('Número de teléfono inválido');
  }
  
  try {
    // 1. Validar si el número existe en WhatsApp y obtener el JID correcto (ej. para México con el "1" extra)
    const [result] = await sock.onWhatsApp(numero);
    if (!result || !result.exists) {
      console.log(`⚠️ [WhatsApp] El número ${numero} no parece estar registrado en WhatsApp. Intentando envío de todas formas...`);
    }
    
    // Si onWhatsApp nos dio el JID real, lo usamos, si no, intentamos con la suposición básica
    const jid = result ? result.jid : `${numero}@s.whatsapp.net`;

    const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    const dd  = String(hoy.getDate()).padStart(2, '0');
    const mm  = String(hoy.getMonth() + 1).padStart(2, '0');
    const yy  = hoy.getFullYear();
    const clienteSlug = (nombreCliente || 'cliente').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_áéíóúÁÉÍÓÚñÑ]/g, '');
    const fileName = `ticket_lapaella_${clienteSlug}_${dd}${mm}${yy}.pdf`;

    await sock.sendMessage(jid, {
      document: pdfBuffer,
      mimetype: 'application/pdf',
      fileName,
      caption: mensajeTexto
    });
    console.log(`✅ [WhatsApp] PDF y mensaje enviados a ${jid} (Original: ${numero})`);
    return true;
  } catch (err) {
    console.error(`❌ [WhatsApp] Error al enviar PDF a ${numero}:`, err);
    throw err;
  }
}

module.exports = { 
  iniciarScheduler, 
  ejecutarResumenDiario, 
  enviarPDFCliente,
  get isWhatsAppReady() { return isWhatsAppReady; }
};
