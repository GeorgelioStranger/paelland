const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

// ── PROTECCIÓN ANTI-CHOQUES (Ignorar errores de RemoteAuth en Windows) ──
process.on('uncaughtException', (err) => {
  if (err.message && err.message.includes('ENOENT: no such file or directory, open') && err.message.includes('RemoteAuth')) {
    console.warn('\n⚠️ [Sistema] Se ignoró un error de lectura de archivo en RemoteAuth (Bug de Windows). El servidor sigue funcionando.');
  } else {
    console.error('\n❌ [Sistema] Error global no capturado:', err);
  }
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const ADMIN_PASSWORD = 'lapaella2026';
const EMPLEADO_PASSWORD = 'lapaellamid';

const generateToken = (role) => Buffer.from(`${role}-${Date.now()}`).toString('base64');
const activeSessions = new Map();

const MONGO_URI = 'mongodb://adminlapaella:lapaella2026@ac-dbfgvnc-shard-00-00.t8gzhqx.mongodb.net:27017,ac-dbfgvnc-shard-00-01.t8gzhqx.mongodb.net:27017,ac-dbfgvnc-shard-00-02.t8gzhqx.mongodb.net:27017/paelladb?ssl=true&replicaSet=atlas-fnio8g-shard-0&authSource=admin&retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas en la nube'))
  .catch(err => console.error('❌ Error conectando a MongoDB:', err.message));

// ------------------- MODELO PEDIDO -------------------
const pedidoSchema = new mongoose.Schema({
  id: Number,
  folio: String,
  nombre: String,
  telefono: String,
  tipo: String,
  itemsDetalle: Array,
  tipoEntrega: String,
  entrega: String,
  direccion: String,
  horaEntrega: String,
  fechaEntrega: String,
  costoEnvio: Number,
  costoFijo: Number,
  costoKm: Number,
  distancia: Number,
  total: Number,
  status: { type: String, default: 'Pendiente' },
  metodoPago: String,
  notas: String,
  extras: Array,
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const Pedido = mongoose.model('Pedido', pedidoSchema);

// ------------------- MODELO GASTO -------------------
const gastoSchema = new mongoose.Schema({
  descripcion: { type: String, required: true },
  monto: { type: Number, required: true },
  categoria: { type: String, default: 'Otro' },
  fecha: String,
  // Campos de integración con inventario
  esInsumo: { type: Boolean, default: false },
  nombreInsumo: String,
  cantidadInsumo: Number,
  unidadInsumo: String,
  creadoEn: { type: Date, default: Date.now }
});

const Gasto = mongoose.model('Gasto', gastoSchema);

// ------------------- MODELO RECETA -------------------
const recetaSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  tipo: { type: String, default: 'kilo' },  // kilo | evento | porcion
  ingredientes: [{
    nombre: String,
    cantidad: Number,
    unidad: String
  }]
});
const Receta = mongoose.model('Receta', recetaSchema);

// ------------------- MODELO INVENTARIO -------------------
const inventarioSchema = new mongoose.Schema({
  ingrediente: { type: String, required: true, unique: true },
  cantidadDisponible: { type: Number, default: 0 },
  unidad: { type: String, default: 'kg' },
  ultimaActualizacion: { type: Date, default: Date.now }
});
const Inventario = mongoose.model('Inventario', inventarioSchema);

// ------------------- MIDDLEWARE AUTH -------------------
function authMiddleware(req, res, next) {
  const tokenHeader = req.headers['authorization'];
  if (!tokenHeader) return res.status(401).json({ error: 'No autorizado' });

  // Admin: contraseña directa o alias Jorgito06
  if (tokenHeader === `Bearer ${ADMIN_PASSWORD}` || tokenHeader === 'Bearer Jorgito06') {
    req.userRole = 'admin';
    return next();
  }

  // Empleado: contraseña directa (resistente a reinicios del servidor)
  if (tokenHeader === `Bearer ${EMPLEADO_PASSWORD}`) {
    req.userRole = 'empleado';
    return next();
  }

  // Compatibilidad con tokens de sesión legacy
  const token = tokenHeader.replace('Bearer ', '');
  const session = activeSessions.get(token);
  if (!session) return res.status(401).json({ error: 'Sesión expirada o inválida' });

  req.userRole = session.role;
  next();
}

// ================= LOGIN =================
app.post('/api/login', (req, res) => {
  const { code } = req.body;
  // Devolver la contraseña como token — el middleware la acepta siempre,
  // incluso tras reinicios del servidor en Render.
  if (code === ADMIN_PASSWORD) {
    return res.json({ success: true, token: ADMIN_PASSWORD, role: 'admin' });
  } else if (code === EMPLEADO_PASSWORD) {
    return res.json({ success: true, token: EMPLEADO_PASSWORD, role: 'empleado' });
  } else {
    return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
  }
});

// ================= PÁGINAS =================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'Admin.html')));
app.get('/estadisticas', (req, res) => res.sendFile(path.join(__dirname, 'estadisticas.html')));
app.get('/cotizador', (req, res) => res.sendFile(path.join(__dirname, 'cotizador1.1.html')));
app.get('/finanzas', (req, res) => res.sendFile(path.join(__dirname, 'finanzas.html')));
app.get('/produccion', (req, res) => res.sendFile(path.join(__dirname, 'produccion.html')));

// =================== PEDIDOS ===================

app.get('/pedidos', authMiddleware, async (req, res) => {
  try {
    const pedidos = await Pedido.find().sort({ createdAt: -1 });
    res.json(pedidos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

app.post('/pedidos', async (req, res) => {
  try {
    const nuevoPedidoData = { id: Date.now(), ...req.body, createdAt: new Date() };
    if (nuevoPedidoData.tipo === 'venta_directa' && nuevoPedidoData.status !== 'Entregado') {
      nuevoPedidoData.status = 'Entregado';
    }
    const nuevoPedido = new Pedido(nuevoPedidoData);
    await nuevoPedido.save();
    res.json({ mensaje: 'Pedido guardado correctamente', id: nuevoPedido.id });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar pedido' });
  }
});

// Editar completo (SOLO ADMIN) — debe ir ANTES de /pedidos/:id para que Express no lo intercepte
app.put('/pedidos/edit/:id', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  try {
    const idParam = req.params.id;
    const updateFields = {
      nombre: req.body.nombre,
      telefono: req.body.telefono,
      itemsDetalle: req.body.itemsDetalle,
      extras: req.body.extras,
      notas: req.body.notas,
      total: req.body.total,
      fechaEntrega: req.body.fechaEntrega,
      horaEntrega: req.body.horaEntrega,
      tipoEntrega: req.body.tipoEntrega,
      direccion: req.body.direccion
    };
    let pedido = null;
    if (idParam.length === 24) {
      pedido = await Pedido.findByIdAndUpdate(idParam, { $set: updateFields }, { new: true }).catch(() => null);
    }
    if (!pedido) {
      pedido = await Pedido.findOneAndUpdate({ id: parseInt(idParam) }, { $set: updateFields }, { new: true });
    }
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(pedido);
  } catch (error) {
    res.status(500).json({ error: 'Error al editar pedido completo' });
  }
});

// Actualizar campos del pedido (status, metodoPago, paelleras, paellerasDevueltas, etc.)
app.put('/pedidos/:id', authMiddleware, async (req, res) => {
  try {
    const idParam = req.params.id;
    const { _id, __v, createdAt, ...updateData } = req.body;
    console.log(`[PUT /pedidos/${idParam}] body:`, JSON.stringify(updateData));
    let pedido = null;
    // strict:false es necesario en las opciones del update para que Mongoose persista campos fuera del schema
    const updateOptions = { new: true, strict: false };
    if (idParam.length === 24) {
      pedido = await Pedido.findByIdAndUpdate(idParam, { $set: updateData }, updateOptions).catch(() => null);
    }
    if (!pedido) {
      pedido = await Pedido.findOneAndUpdate({ id: parseInt(idParam) }, { $set: updateData }, updateOptions);
    }
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    console.log(`[PUT OK] paelleras=${pedido.paelleras} status=${pedido.status}`);
    res.json(pedido);
  } catch (error) {
    console.error('Error al actualizar pedido:', error);
    res.status(500).json({ error: 'Error al actualizar pedido' });
  }
});

// Eliminar pedido (SOLO ADMIN)
app.delete('/pedidos/:id', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  try {
    const idParam = req.params.id;
    let pedido = null;
    if (idParam.length === 24) {
      pedido = await Pedido.findByIdAndDelete(idParam).catch(() => null);
    }
    if (!pedido) pedido = await Pedido.findOneAndDelete({ id: parseInt(idParam) });
    if (pedido) res.json({ ok: true });
    else res.status(404).json({ error: 'Pedido no encontrado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al borrar pedido' });
  }
});

// =================== GASTOS ===================

app.get('/gastos', authMiddleware, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    let query = {};
    if (desde && hasta) query.fecha = { $gte: desde, $lte: hasta };
    else if (desde) query.fecha = { $gte: desde };
    const gastos = await Gasto.find(query).sort({ creadoEn: -1 });
    res.json(gastos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener gastos' });
  }
});

app.post('/gastos', authMiddleware, async (req, res) => {
  try {
    const { descripcion, monto, categoria, fecha, esInsumo, nombreInsumo, cantidadInsumo, unidadInsumo } = req.body;
    
    const gasto = new Gasto({
      descripcion,
      monto: parseFloat(monto),
      categoria: categoria || 'Otro',
      fecha: fecha || new Date().toISOString().split('T')[0],
      esInsumo: !!esInsumo,
      nombreInsumo,
      cantidadInsumo: parseFloat(cantidadInsumo),
      unidadInsumo
    });
    await gasto.save();

    // Integración con Inventario
    if (gasto.esInsumo && gasto.nombreInsumo && gasto.cantidadInsumo > 0) {
      await Inventario.findOneAndUpdate(
        { ingrediente: gasto.nombreInsumo },
        { 
          $inc: { cantidadDisponible: gasto.cantidadInsumo },
          $set: { unidad: gasto.unidadInsumo || 'kg', ultimaActualizacion: new Date() }
        },
        { upsert: true, new: true }
      );
    }

    res.json({ ok: true, gasto });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar gasto' });
  }
});

app.delete('/gastos/:id', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  try {
    const gasto = await Gasto.findById(req.params.id);
    if (!gasto) return res.status(404).json({ error: 'Gasto no encontrado' });

    // Si era un insumo, restar del inventario
    if (gasto.esInsumo && gasto.nombreInsumo && gasto.cantidadInsumo > 0) {
      await Inventario.findOneAndUpdate(
        { ingrediente: gasto.nombreInsumo },
        { 
          $inc: { cantidadDisponible: -gasto.cantidadInsumo },
          $set: { ultimaActualizacion: new Date() }
        }
      );
    }

    await Gasto.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al borrar gasto' });
  }
});

// =================== RECETAS ===================

app.get('/recetas', authMiddleware, async (req, res) => {
  try {
    const recetas = await Receta.find();
    res.json(recetas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener recetas' });
  }
});

app.post('/recetas', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  try {
    const { _id, nombre, tipo, ingredientes } = req.body;
    if (_id) {
      const receta = await Receta.findByIdAndUpdate(_id, { nombre, tipo, ingredientes }, { new: true });
      return res.json({ ok: true, receta });
    }
    const receta = new Receta({ nombre, tipo, ingredientes });
    await receta.save();
    res.json({ ok: true, receta });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar receta' });
  }
});

app.delete('/recetas/:id', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  try {
    await Receta.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar receta' });
  }
});

// =================== INVENTARIO ===================

app.get('/inventario', authMiddleware, async (req, res) => {
  try {
    const inventario = await Inventario.find().sort({ ingrediente: 1 });
    res.json(inventario);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener inventario' });
  }
});

app.put('/inventario/:ingrediente', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  try {
    const ingrediente = decodeURIComponent(req.params.ingrediente);
    const { cantidadDisponible, unidad } = req.body;
    const item = await Inventario.findOneAndUpdate(
      { ingrediente },
      { cantidadDisponible, unidad: unidad || 'kg', ultimaActualizacion: new Date() },
      { new: true, upsert: true }
    );
    res.json({ ok: true, item });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar inventario' });
  }
});

app.delete('/inventario/:ingrediente', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  try {
    const ingrediente = decodeURIComponent(req.params.ingrediente);
    await Inventario.findOneAndDelete({ ingrediente });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar inventario' });
  }
});

// ------------------- SCHEDULER WHATSAPP -------------------
const whatsappModule = require('./whatsapp-scheduler');
whatsappModule.iniciarScheduler(app, Pedido);

// =================== ENVÍO DE PDF POR WHATSAPP ===================
const PDFDocument = require('pdfkit');

app.post('/pedidos/enviar-ticket-whatsapp', authMiddleware, async (req, res) => {
  try {
    if (!whatsappModule.isWhatsAppReady) {
      return res.status(503).json({ error: 'WhatsApp no está conectado o listo en el servidor.' });
    }

    const pedido = req.body;
    if (!pedido || !pedido.telefono) {
      return res.status(400).json({ error: 'Faltan datos del pedido o el teléfono.' });
    }

    // 1. Generar el PDF en memoria
    const doc = new PDFDocument({ margin: 30, size: [226.77, 700], autoFirstPage: true }); // 80mm
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    const tipoTxt = pedido.tipo === 'venta_directa' ? 'VENTA DE MOSTRADOR' : (pedido.tipo === 'evento' ? 'PEDIDO EVENTO' : 'PEDIDO POR KILO');
    const now = new Date();
    const fechaTxt = now.toLocaleDateString('es-MX') + ' ' + now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const folioVal = pedido.folio ? pedido.folio.toString().slice(-6).toUpperCase() : now.getTime().toString().slice(-6);
    const folioStr = '#' + folioVal;
    const nombreCliente = pedido.cliente || pedido.nombre || '';
    const totalVenta = pedido.total || 0;

    // Logo
    const logoPath = path.join(__dirname, 'logoPaelland.png');
    try {
      doc.image(logoPath, { fit: [130, 65], align: 'center' });
    } catch (_) {
      doc.font('Helvetica-Bold').fontSize(16).text('LA PAELLA', { align: 'center' });
    }
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).text('Mérida, Yucatán', { align: 'center' });
    doc.moveDown(0.8);

    // Meta info (dos columnas: etiqueta | valor)
    const metaLeft = 30;
    const metaLabelW = 72;
    doc.font('Helvetica').fontSize(9);
    const drawMeta = (label, value) => {
      const y = doc.y;
      doc.text(label, metaLeft, y, { width: metaLabelW });
      doc.text(value, metaLeft + metaLabelW, y, { width: 166 - metaLabelW - metaLeft });
      doc.moveDown(0.2);
    };
    drawMeta('F. Emisión:', fechaTxt);
    drawMeta('Folio:', folioStr);
    drawMeta('Tipo:', tipoTxt);
    if (nombreCliente) drawMeta('Cliente:', nombreCliente);

    doc.moveDown(0.5);
    doc.moveTo(30, doc.y).lineTo(196, doc.y).dash(2, { space: 2 }).stroke();
    doc.moveDown(0.5);

    // Encabezado tabla
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('CANT. / CONCEPTO', 30, doc.y, { continued: true });
    doc.text('IMPORTE', { align: 'right' });
    doc.font('Helvetica').fontSize(9);

    // Productos (solo los con cantidad > 0)
    if (pedido.items && Array.isArray(pedido.items)) {
      pedido.items.forEach(item => {
        const qty = pedido.tipo === 'evento' ? (item.personas || 0) : (item.cantidad || 0);
        if (qty <= 0) return;
        const nombre = item.nombre || '';
        const sub = qty * (item.precio || 0);
        const label = pedido.tipo === 'evento' ? `${qty} pax ${nombre}` : `${qty}x ${nombre}`;
        doc.text(label, 30, doc.y, { width: 110, continued: true });
        doc.text(`$${sub.toLocaleString('es-MX')}`, { align: 'right' });
      });
    }

    // Extras
    if (pedido.extras && Array.isArray(pedido.extras)) {
      pedido.extras.forEach(ex => {
        if (ex.nombre && ex.cantidad > 0) {
          const sub = ex.cantidad * (ex.precio || 0);
          doc.text(`+ ${ex.cantidad}x ${ex.nombre}`, 30, doc.y, { width: 110, continued: true });
          doc.text(`$${sub.toLocaleString('es-MX')}`, { align: 'right' });
        }
      });
    }

    // Costo de envío
    const tipoEnvioFinal = pedido.tipoEntrega || pedido.entrega;
    if (tipoEnvioFinal === 'domicilio') {
      let costoEnvio = pedido.costoEnvio || 0;
      if (!costoEnvio && pedido.costoFijo != null) costoEnvio = pedido.costoFijo + ((pedido.distancia || 0) * (pedido.costoKm || 0));
      if (costoEnvio > 0) {
        doc.text('Envío Domicilio', 30, doc.y, { width: 110, continued: true });
        doc.text(`$${costoEnvio.toLocaleString('es-MX')}`, { align: 'right' });
      }
    } else if (pedido.tipo !== 'venta_directa') {
      doc.fontSize(8).text('Recolección en Mostrador (Pick-up)', { align: 'center', oblique: true });
      doc.fontSize(9);
    }

    doc.moveDown(0.5);
    doc.moveTo(30, doc.y).lineTo(196, doc.y).undash().lineWidth(1.5).stroke();
    doc.lineWidth(1);
    doc.moveDown(0.4);

    // Total
    doc.font('Helvetica-Bold').fontSize(13);
    doc.text('TOTAL M.N.', 30, doc.y, { continued: true });
    doc.text(`$${totalVenta.toLocaleString('es-MX')}`, { align: 'right' });

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(10).text('¡Gracias por tu preferencia!', { align: 'center' });

    doc.end();

    // Promesa para esperar que termine el PDF
    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
    });

    // 2. Generar el mensaje de texto (mismo formato actual)
    const clienteStr = pedido.cliente || pedido.nombre || "Cliente";
    const fechaStr = pedido.fecha ? new Date(pedido.fecha + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "";
    const horaStr = pedido.hora ? `a las ${pedido.hora}` : "";
    
    let lineasText = "";
    if (pedido.items) {
      pedido.items.forEach(it => {
        const qty = it.cantidad || it.personas || 1;
        const sub = qty * (it.precio || 0);
        lineasText += `  • ${it.nombre} × ${qty} = $${sub.toLocaleString("es-MX")}\n`;
      });
    }
    if (pedido.extras) {
      pedido.extras.forEach(ex => {
        if (ex.nombre && ex.cantidad > 0) {
          const sub = ex.cantidad * (ex.precio || 0);
          lineasText += `  • ${ex.nombre} × ${ex.cantidad} = $${sub.toLocaleString("es-MX")}\n`;
        }
      });
    }
    
    let trasladoStr = "";
    if (tipoEnvioFinal === "domicilio") {
      const dist = pedido.distancia || 0;
      let costoEnvio = pedido.costoEnvio || 0;
      if (!costoEnvio && pedido.costoFijo != null) costoEnvio = pedido.costoFijo + (dist * (pedido.costoKm || 0));
      trasladoStr = `\n*Entrega a domicilio*\nTraslado: $${Math.round(costoEnvio).toLocaleString("es-MX")}\n`;
    } else if (pedido.tipo !== 'venta_directa') {
      trasladoStr = "\n*Pick up en local*\n";
    }

    const notasStr = pedido.notas ? `\n*Notas:* ${pedido.notas}\n` : "";
    const tituloMsg = pedido.tipo === 'evento' ? 'Pedido CONFIRMADA - EVENTO' : 'PEDIDO CONFIRMADO - PAELLA';

    const mensajeTexto = `*${tituloMsg}*\n👤 ${clienteStr}\n📅 ${fechaStr} ${horaStr}\n\n*Productos:*\n${lineasText}${trasladoStr}${notasStr}\n*Total a pagar: $${Math.round(totalVenta).toLocaleString("es-MX")}*\n\nGracias por tu preferencia.`;

    // 3. Enviar vía WhatsApp
    await whatsappModule.enviarPDFCliente(pedido.telefono, mensajeTexto, pdfBuffer);

    res.json({ ok: true, mensaje: 'Mensaje y PDF enviados correctamente.' });

  } catch (error) {
    console.error('Error al enviar ticket por WhatsApp:', error);
    res.status(500).json({ error: error.message || 'Error al enviar por WhatsApp' });
  }
});

// ------------------- SERVIDOR -------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Sistema listo! (Puerto ${PORT})`);
  console.log(`🔐 Contraseña admin: ${ADMIN_PASSWORD}`);
});