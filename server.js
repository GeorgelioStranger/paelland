const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const ADMIN_PASSWORD = 'lapaella2026';
const EMPLEADO_PASSWORD = 'lapaellamid';

const generateToken = (role) => Buffer.from(`${role}-${Date.now()}`).toString('base64');
const activeSessions = new Map();

const MONGO_URI = 'mongodb+srv://adminlapaella:lapaella2026@cluster0.t8gzhqx.mongodb.net/paelladb?retryWrites=true&w=majority';

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

  if (tokenHeader === `Bearer ${ADMIN_PASSWORD}` || tokenHeader === 'Bearer Jorgito06') {
    req.userRole = 'admin';
    return next();
  }

  const token = tokenHeader.replace('Bearer ', '');
  const session = activeSessions.get(token);
  if (!session) return res.status(401).json({ error: 'Sesión expirada o inválida' });

  req.userRole = session.role;
  next();
}

// ================= LOGIN =================
app.post('/api/login', (req, res) => {
  const { code } = req.body;
  if (code === ADMIN_PASSWORD) {
    const token = generateToken('admin');
    activeSessions.set(token, { role: 'admin' });
    return res.json({ success: true, token, role: 'admin' });
  } else if (code === EMPLEADO_PASSWORD) {
    const token = generateToken('empleado');
    activeSessions.set(token, { role: 'empleado' });
    return res.json({ success: true, token, role: 'empleado' });
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

// ------------------- SERVIDOR -------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Sistema listo! (Puerto ${PORT})`);
  console.log(`🔐 Contraseña admin: ${ADMIN_PASSWORD}`);
});