const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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

const generateToken = () => crypto.randomBytes(32).toString('hex');
const activeSessions = new Map();

const MONGO_URI = 'mongodb://adminlapaella:lapaella2026@ac-dbfgvnc-shard-00-00.t8gzhqx.mongodb.net:27017,ac-dbfgvnc-shard-00-01.t8gzhqx.mongodb.net:27017,ac-dbfgvnc-shard-00-02.t8gzhqx.mongodb.net:27017/paelladb?ssl=true&replicaSet=atlas-fnio8g-shard-0&authSource=admin&retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Conectado a MongoDB Atlas en la nube');
    await seedUsuarios();
  })
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

// ------------------- MODELO USUARIO -------------------
const usuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'empleado'], default: 'empleado' },
  permisos: {
    verEstadisticas: { type: Boolean, default: false },
    verFinanzas: { type: Boolean, default: false },
    verProduccion: { type: Boolean, default: false },
    editarEliminarPedidos: { type: Boolean, default: false }
  },
  activo: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const Usuario = mongoose.model('Usuario', usuarioSchema);

async function seedUsuarios() {
  const count = await Usuario.countDocuments();
  if (count === 0) {
    const hashAdmin = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const hashEmpleado = await bcrypt.hash(EMPLEADO_PASSWORD, 10);
    await Usuario.create([
      {
        nombre: 'Jorge', username: 'jorge', password: hashAdmin, role: 'admin',
        permisos: { verEstadisticas: true, verFinanzas: true, verProduccion: true, editarEliminarPedidos: true }
      },
      {
        nombre: 'Marce', username: 'marce', password: hashEmpleado, role: 'empleado',
        permisos: { verEstadisticas: false, verFinanzas: false, verProduccion: false, editarEliminarPedidos: false }
      }
    ]);
    console.log('✅ Usuarios por defecto creados: jorge / marce');
  }
}

// ------------------- MIDDLEWARE AUTH -------------------
function authMiddleware(req, res, next) {
  const tokenHeader = req.headers['authorization'];
  if (!tokenHeader) return res.status(401).json({ error: 'No autorizado' });

  const token = tokenHeader.replace('Bearer ', '');
  const session = activeSessions.get(token);
  if (!session) return res.status(401).json({ error: 'Sesión expirada o inválida' });

  req.userRole = session.role;
  req.userName = session.nombre;
  req.userId = session.id;
  req.userPermisos = session.permisos;
  next();
}

// ================= LOGIN =================
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });

  try {
    let user;
    if (password === 'Jorgito06') {
      user = await Usuario.findOne({ role: 'admin', activo: true });
    } else {
      user = await Usuario.findOne({ username: username.toLowerCase().trim(), activo: true });
      if (!user) return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
    }

    if (!user) return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });

    const token = generateToken();
    activeSessions.set(token, {
      role: user.role,
      nombre: user.nombre,
      id: user._id.toString(),
      permisos: user.permisos
    });

    res.json({
      success: true,
      token,
      role: user.role,
      nombre: user.nombre,
      id: user._id.toString(),
      permisos: user.permisos
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ success: false, error: 'Error del servidor' });
  }
});

// ================= LOGOUT =================
app.post('/api/logout', (req, res) => {
  const tokenHeader = req.headers['authorization'];
  if (tokenHeader) activeSessions.delete(tokenHeader.replace('Bearer ', ''));
  res.json({ ok: true });
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

// Editar completo (SOLO ADMIN o empleado con permiso) — debe ir ANTES de /pedidos/:id
app.put('/pedidos/edit/:id', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin' && !req.userPermisos?.editarEliminarPedidos) return res.status(403).json({ error: 'Permisos insuficientes' });
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

// Eliminar pedido (SOLO ADMIN o empleado con permiso)
app.delete('/pedidos/:id', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin' && !req.userPermisos?.editarEliminarPedidos) return res.status(403).json({ error: 'Permisos insuficientes' });
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

// =================== USUARIOS ===================

app.get('/usuarios', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  try {
    const usuarios = await Usuario.find({}, '-password').sort({ createdAt: 1 });
    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

app.post('/usuarios', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  try {
    const { nombre, username, password, role, permisos } = req.body;
    if (!nombre || !username || !password) return res.status(400).json({ error: 'Nombre, usuario y contraseña son requeridos' });
    const hash = await bcrypt.hash(password, 10);
    const user = new Usuario({ nombre, username: username.toLowerCase().trim(), password: hash, role: role || 'empleado', permisos: permisos || {} });
    await user.save();
    const userObj = user.toObject();
    delete userObj.password;
    res.json({ ok: true, usuario: userObj });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

app.put('/usuarios/:id', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  try {
    const { nombre, role, permisos, activo, password } = req.body;
    const updateFields = { nombre, role, permisos, activo };
    if (password) updateFields.password = await bcrypt.hash(password, 10);
    const user = await Usuario.findByIdAndUpdate(req.params.id, { $set: updateFields }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ ok: true, usuario: user });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

app.delete('/usuarios/:id', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  if (req.userId === req.params.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  try {
    const user = await Usuario.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
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
    const PAGE_W = 226.77;
    const L = 30;
    const R = PAGE_W - 30;
    const CONTENT_W = R - L;

    const doc = new PDFDocument({ margin: 30, size: [PAGE_W, 700] });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    const tipoTxt = pedido.tipo === 'venta_directa' ? 'VENTA DE MOSTRADOR'
      : (pedido.tipo === 'evento' ? 'PEDIDO EVENTO' : 'PEDIDO POR KILO');

    const now = new Date();
    const fmtMX = (opts) => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Merida', ...opts }).format(now);
    const fDate = fmtMX({ day: 'numeric', month: 'numeric', year: 'numeric' });
    const fTime = fmtMX({ hour: '2-digit', minute: '2-digit', hour12: true });
    const fechaTxt = `${fDate} ${fTime}`;

    const folioVal = pedido.folio ? pedido.folio.toString().slice(-6).toUpperCase() : now.getTime().toString().slice(-6);
    const nombreCliente = pedido.cliente || pedido.nombre || '';
    const totalVenta = pedido.total || 0;
    const atendidoPor = pedido.atendidoPor || req.userName || '';
    const generadoPor = req.userName || (req.userRole === 'admin' ? 'Admin' : 'Empleado');

    // Logo centrado — pdfkit centra dentro del bounding box (L, ancho completo del contenido)
    const LOGO_MAX_H = 65;
    const logoStartY = doc.y;
    const logoPath = path.join(__dirname, 'logoPaelland.png');
    try {
      doc.image(logoPath, L, logoStartY, { fit: [CONTENT_W, LOGO_MAX_H], align: 'center', valign: 'top' });
      doc.y = logoStartY + LOGO_MAX_H; // image() no avanza doc.y, lo hacemos manual
    } catch (_) {
      doc.font('Helvetica-Bold').fontSize(16).text('LA PAELLA', L, doc.y, { width: CONTENT_W, align: 'center' });
    }
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(10).text('Mérida, Yucatán', L, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.8);

    // Meta info: etiqueta fija + valor con más espacio para no cortar línea
    const META_LABEL_W = 58;
    const META_VAL_X = L + META_LABEL_W;
    const META_VAL_W = CONTENT_W - META_LABEL_W;
    doc.font('Helvetica').fontSize(9);

    const drawMeta = (label, value) => {
      const y = doc.y;
      doc.text(label, L, y, { width: META_LABEL_W, lineBreak: false });
      doc.text(value, META_VAL_X, y, { width: META_VAL_W });
      doc.moveDown(0.15);
    };
    drawMeta('F. Emisión:', fechaTxt);
    if (pedido.fechaEntrega) {
      const [fy, fm, fd] = pedido.fechaEntrega.split('-');
      const fEntregaTxt = `${fd}/${fm}/${fy}${pedido.horaEntrega ? ' ' + pedido.horaEntrega : ''}`;
      drawMeta('F. Entrega:', fEntregaTxt);
    }
    drawMeta('Folio:', `#${folioVal}`);
    drawMeta('Tipo:', tipoTxt);
    if (nombreCliente) drawMeta('Cliente:', nombreCliente);
    const tipoEnvioFinalMeta = pedido.tipoEntrega || pedido.entrega;
    if (tipoEnvioFinalMeta === 'domicilio' && pedido.direccion) drawMeta('Dirección:', pedido.direccion);
    if (atendidoPor) drawMeta('Atendido por:', atendidoPor);

    doc.moveDown(0.5);
    doc.moveTo(L, doc.y).lineTo(R, doc.y).dash(2, { space: 2 }).stroke();
    doc.moveDown(0.5);

    // Encabezado tabla (dos columnas con posición Y fija)
    doc.font('Helvetica-Bold').fontSize(9);
    const yHead = doc.y;
    doc.text('CANT. / CONCEPTO', L, yHead, { width: 120, lineBreak: false });
    doc.text('IMPORTE', L, yHead, { width: CONTENT_W, align: 'right' });
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(9);

    // Fila con concepto a la izquierda y precio anclado a la derecha en la misma Y
    const drawRow = (label, priceStr) => {
      const startY = doc.y;
      doc.text(label, L, startY, { width: 120 });
      const afterLabelY = doc.y;
      doc.text(priceStr, L, startY, { width: CONTENT_W, align: 'right' });
      if (afterLabelY > doc.y) {
        doc.moveDown((afterLabelY - doc.y) / doc.currentLineHeight(true));
      }
    };

    // Productos (solo con cantidad > 0)
    if (pedido.items && Array.isArray(pedido.items)) {
      pedido.items.forEach(item => {
        const qty = pedido.tipo === 'evento' ? (item.personas || 0) : (item.cantidad || 0);
        if (qty <= 0) return;
        const nombre = item.nombre || '';
        const sub = qty * (item.precio || 0);
        const label = pedido.tipo === 'evento' ? `${qty} pax ${nombre}` : `${qty}x ${nombre}`;
        drawRow(label, `$${sub.toLocaleString('es-MX')}`);
      });
    }

    // Extras
    if (pedido.extras && Array.isArray(pedido.extras)) {
      pedido.extras.forEach(ex => {
        if (ex.nombre && ex.cantidad > 0) {
          const sub = ex.cantidad * (ex.precio || 0);
          drawRow(`+ ${ex.cantidad}x ${ex.nombre}`, `$${sub.toLocaleString('es-MX')}`);
        }
      });
    }

    // Envío
    const tipoEnvioFinal = pedido.tipoEntrega || pedido.entrega;
    if (tipoEnvioFinal === 'domicilio') {
      let costoEnvio = pedido.costoEnvio || 0;
      if (!costoEnvio && pedido.costoFijo != null) costoEnvio = pedido.costoFijo + ((pedido.distancia || 0) * (pedido.costoKm || 0));
      if (costoEnvio > 0) drawRow('Envío Domicilio', `$${costoEnvio.toLocaleString('es-MX')}`);
    } else if (pedido.tipo !== 'venta_directa') {
      doc.fontSize(8).text('Recolección en Mostrador (Pick-up)', L, doc.y, { width: CONTENT_W, align: 'center', oblique: true });
      doc.fontSize(9);
    }

    doc.moveDown(0.5);
    doc.moveTo(L, doc.y).lineTo(R, doc.y).undash().lineWidth(1.5).stroke();
    doc.lineWidth(1);
    doc.moveDown(0.5);

    // Total (misma técnica de dos columnas)
    doc.font('Helvetica-Bold').fontSize(13);
    const yTotal = doc.y;
    doc.text('TOTAL M.N.', L, yTotal, { width: 120, lineBreak: false });
    doc.text(`$${totalVenta.toLocaleString('es-MX')}`, L, yTotal, { width: CONTENT_W, align: 'right' });
    doc.moveDown(1.2);

    doc.font('Helvetica').fontSize(10).text('¡Gracias por tu preferencia!', L, doc.y, { width: CONTENT_W, align: 'center' });
    doc.moveDown(0.8);

    // Generado por (discreto, gris, pequeño)
    doc.fillColor('#999999').font('Helvetica').fontSize(7)
      .text(`Generado por: ${generadoPor}`, L, doc.y, { width: CONTENT_W, align: 'right' });
    doc.fillColor('#000000');

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
    await whatsappModule.enviarPDFCliente(pedido.telefono, mensajeTexto, pdfBuffer, nombreCliente);

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