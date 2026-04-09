const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const ADMIN_PASSWORD = 'lapaella2026'; // 🔐 Cambia esta contraseña por la que quieras

// =========================================================================
// ⚠️ ATENCIÓN JORGE: CAMBIA LA PALABRA "TU_CONTRASEÑA_AQUI" por tu verdadera contraseña de la Base de Datos
const MONGO_URI = 'mongodb+srv://adminlapaella:lapaella2026@cluster0.t8gzhqx.mongodb.net/paelladb?retryWrites=true&w=majority';
// =========================================================================

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas en la nube'))
  .catch(err => console.error('❌ Error conectando a MongoDB:', err.message));

// ------------------- MODELO DE BASE DE DATOS -------------------
const pedidoSchema = new mongoose.Schema({
  id: Number,
  nombre: String,
  telefono: String,
  tipo: String,
  itemsDetalle: Array,
  tipoEntrega: String,
  direccion: String,
  horaEntrega: String,
  fechaEntrega: String,
  total: Number,
  status: { type: String, default: 'Pendiente' },
  createdAt: { type: Date, default: Date.now }
});

const Pedido = mongoose.model('Pedido', pedidoSchema);

// ------------------- MIDDLEWARE DE AUTENTICACIÓN -------------------
function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (token === `Bearer ${ADMIN_PASSWORD}`) {
    next();
  } else {
    res.status(401).json({ error: 'No autorizado' });
  }
}

// ------------------- RUTAS PÚBLICAS -------------------
// Login (para obtener token)
app.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: ADMIN_PASSWORD });
  } else {
    res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
  }
});

// Página principal (pública)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ------------------- RUTAS PROTEGIDAS (requieren autenticación) -------------------
app.get('/pedidos', authMiddleware, async (req, res) => {
  try {
    const pedidos = await Pedido.find().sort({ createdAt: -1 });
    res.json(pedidos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

app.post('/pedidos', authMiddleware, async (req, res) => {
  try {
    const nuevoPedidoData = {
      id: Date.now(),
      ...req.body,
      createdAt: new Date()
    };

    // Asegurar que las ventas directas tengan status "Entregado"
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

app.put('/pedidos/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pedido = await Pedido.findOneAndUpdate({ id: id }, { status: req.body.status });
    if (pedido) {
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: 'Pedido no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar pedido' });
  }
});

app.delete('/pedidos/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pedido = await Pedido.findOneAndDelete({ id: id });
    if (pedido) {
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: 'Pedido no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al borrar pedido' });
  }
});

// ------------------- INICIAR SERVIDOR -------------------
const PORT = process.env.PORT || 3001; // process.env.PORT es requerido para Render
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Sistema listo! (Puerto ${PORT})`);
  console.log(`🔐 Contraseña admin: ${ADMIN_PASSWORD}`);
});