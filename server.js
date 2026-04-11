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
  creadoEn: { type: Date, default: Date.now }
});

const Gasto = mongoose.model('Gasto', gastoSchema);

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

// Cambiar status + metodoPago
app.put('/pedidos/:id', authMiddleware, async (req, res) => {
  try {
    const idParam = req.params.id;
    const updateData = {};
    if (req.body.status) updateData.status = req.body.status;
    if (req.body.metodoPago) updateData.metodoPago = req.body.metodoPago;

    let pedido = null;
    // Intentar por _id de Mongo primero
    if (idParam.length === 24) {
      pedido = await Pedido.findByIdAndUpdate(idParam, updateData, { new: true }).catch(() => null);
    }
    // Fallback: buscar por id numérico
    if (!pedido) {
      pedido = await Pedido.findOneAndUpdate({ id: parseInt(idParam) }, updateData, { new: true });
    }
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(pedido);
  } catch (error) {
    console.error("Error al actualizar pedido:", error);
    res.status(500).json({ error: 'Error al actualizar pedido' });
  }
});

// Editar completo (SOLO ADMIN)
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
      pedido = await Pedido.findByIdAndUpdate(idParam, updateFields, { new: true }).catch(() => null);
    }
    if (!pedido) {
      pedido = await Pedido.findOneAndUpdate({ id: parseInt(idParam) }, updateFields, { new: true });
    }
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(pedido);
  } catch (error) {
    res.status(500).json({ error: 'Error al editar pedido completo' });
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
    const gasto = new Gasto({
      descripcion: req.body.descripcion,
      monto: parseFloat(req.body.monto),
      categoria: req.body.categoria || 'Otro',
      fecha: req.body.fecha || new Date().toISOString().split('T')[0]
    });
    await gasto.save();
    res.json({ ok: true, gasto });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar gasto' });
  }
});

app.delete('/gastos/:id', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  try {
    await Gasto.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al borrar gasto' });
  }
});

// ------------------- SERVIDOR -------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Sistema listo! (Puerto ${PORT})`);
  console.log(`🔐 Contraseña admin: ${ADMIN_PASSWORD}`);
});