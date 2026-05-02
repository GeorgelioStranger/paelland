// =====================================================
//   SCHEDULER DE WHATSAPP — Sistema PAELLAND
//   Envío automático diario a las 3:30 PM (México)
//   Servicio: CallMeBot (gratuito)
// =====================================================

const cron = require('node-cron');
const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
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

let whatsappClient = null;
let isWhatsAppReady = false;
let isWaitingForQR = false;
let lastError = null;

// ── Función principal: consultar BD y enviar resumen ──
async function ejecutarResumenDiario(Pedido) {
  const fechaMañana = getFechaMañana();
  console.log(`\n📱 [WhatsApp Scheduler] Iniciando resumen para ${fechaMañana}...`);

  if (!isWhatsAppReady || !whatsappClient) {
    console.error('❌ [WhatsApp] El cliente de WhatsApp no está listo. No se puede enviar el resumen.');
    return;
  }

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

    // Enviar a cada grupo configurado
    for (const grupo of grupos) {
      if (!grupo.activo || !grupo.id || grupo.id.includes('XXXXXXXXX')) {
        console.warn(`⚠️  [WhatsApp] Grupo "${grupo.nombre}" sin configurar o inactivo. Edita whatsapp-config.js`);
        continue;
      }

      try {
        await whatsappClient.sendMessage(grupo.id, mensaje);
        console.log(`✅ [WhatsApp] Mensaje enviado al grupo: ${grupo.nombre}`);
        // Pausa de 2 s entre envíos
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

// ── Iniciar el cron job y cliente de WhatsApp ──
async function iniciarScheduler(app, Pedido) {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.log('⏳ [WhatsApp] Esperando conexión a MongoDB para RemoteAuth...');
      await new Promise(resolve => mongoose.connection.once('open', resolve));
    }

    const fs = require('fs');
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    let localExecutablePath = undefined;
    if (process.platform === 'win32') {
      for (const p of chromePaths) {
        if (fs.existsSync(p)) {
          localExecutablePath = p;
          console.log(`🔎 [WhatsApp] Navegador local encontrado en: ${p}`);
          break;
        }
      }
    }

    const store = new MongoStore({ mongoose: mongoose });
    
    let puppeteerConfig = {
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };

    if (process.platform === 'win32' && localExecutablePath) {
      puppeteerConfig.executablePath = localExecutablePath;
    } else {
      console.log('☁️ [WhatsApp] Entorno de nube detectado. Preparando Chromium con Sparticuz (Modo Bajo Consumo)...');
      const chromium = require('@sparticuz/chromium');
      
      // Limpiar cachés viejos de chromium para ahorrar espacio en disco
      chromium.setGraphicsMode = false;
      
      puppeteerConfig.executablePath = await chromium.executablePath();
      puppeteerConfig.headless = chromium.headless;
      puppeteerConfig.args = [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ];
      puppeteerConfig.defaultViewport = chromium.defaultViewport;
    }

    whatsappClient = new Client({
      authStrategy: new RemoteAuth({
        clientId: 'paelland-session-v2',
        store: store,
        backupSyncIntervalMs: 300000
      }),
      puppeteer: puppeteerConfig
    });

    whatsappClient.on('qr', (qr) => {
      isWaitingForQR = true;
      lastError = null;
      console.log('\n======================================================');
      console.log('📸 ¡ATENCIÓN! ESCANEA EL SIGUIENTE CÓDIGO QR CON WHATSAPP:');
      console.log('======================================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\n======================================================');
    });

    whatsappClient.on('ready', () => {
      isWaitingForQR = false;
      isWhatsAppReady = true;
      lastError = null;
      console.log('\n✅ [WhatsApp] ¡Cliente listo y conectado!');
    });

    whatsappClient.on('authenticated', () => {
      isWaitingForQR = false;
      console.log('🔐 [WhatsApp] Autenticado correctamente.');
    });

    whatsappClient.on('auth_failure', msg => {
      isWaitingForQR = false;
      lastError = 'Fallo en autenticación: ' + msg;
      console.error('❌ [WhatsApp] Fallo en la autenticación:', msg);
    });
    
    whatsappClient.on('disconnected', (reason) => {
      isWhatsAppReady = false;
      lastError = 'Desconectado: ' + reason;
      console.log('❌ [WhatsApp] Cliente desconectado:', reason);
    });
    
    whatsappClient.on('remote_session_saved', () => {
      console.log('💾 [WhatsApp] Sesión guardada en MongoDB correctamente.');
    });

    try {
      await whatsappClient.initialize();
    } catch (err) {
      lastError = 'Crash al inicializar: ' + err.message;
      console.error('❌ [WhatsApp] Crash fatal en initialize:', err);
    }
  } catch (globalErr) {
    lastError = 'Error fatal iniciando: ' + globalErr.message;
    console.error('❌ [WhatsApp] Error global en iniciarScheduler:', globalErr);
  }

  // Cron: todos los días a las 14:00 (2:00 PM) y 19:00 (7:00 PM), zona horaria de México
  cron.schedule('0 14,19 * * *', () => {
    ejecutarResumenDiario(Pedido);
  }, {
    timezone: 'America/Mexico_City'
  });

  console.log('⏰ [WhatsApp Scheduler] Activo → envío automático todos los días a las 2:00 PM y 7:00 PM (CDMX)');

  // ── Endpoint de prueba: POST o GET /whatsapp/test ──
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

  // ── Endpoint para listar chats ──
  app.get('/whatsapp/chats', async (req, res) => {
    if (!isWhatsAppReady || !whatsappClient) {
      return res.status(503).json({ error: 'WhatsApp aún no está listo. Revisa la consola del servidor y escanea el código QR primero.' });
    }
    try {
      const chats = await whatsappClient.getChats();
      const gruposChats = chats.filter(c => c.isGroup).map(g => ({
        nombre: g.name,
        id: g.id._serialized
      }));
      res.json({ grupos: gruposChats });
    } catch (error) {
      res.status(500).json({ error: 'Error al obtener chats', detalle: error.message });
    }
  });
}

module.exports = { iniciarScheduler, ejecutarResumenDiario };
