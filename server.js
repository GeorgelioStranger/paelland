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
  notas: String,
  extras: Array,
  createdAt: { type: Date, default: Date.now }
});

const Pedido = mongoose.model('Pedido', pedidoSchema);

// ------------------- MIDDLEWARE DE AUTENTICACIÓN -------------------
function authMiddleware(req, res, next) {
  const tokenHeader = req.headers['authorization'];
  if (!tokenHeader) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  // Si envían la contraseña directa vieja, también le damos paso admin como puente provisional
  if (tokenHeader === `Bearer ${ADMIN_PASSWORD}`) {
    req.userRole = 'admin';
    return next();
  }

  const token = tokenHeader.replace('Bearer ', '');
  const session = activeSessions.get(token);
  
  if (!session) {
    return res.status(401).json({ error: 'Sesión expirada o inválida' });
  }

  req.userRole = session.role; // Puede ser 'admin' o 'empleado'
  next();
}

// ================= RUTAS DE LOGIN =================
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

// ------------------- RUTAS PÚBLICAS -------------------
// Limpieza de ruta login antigua

// Página principal (pública)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rutas a las otras pantallas para URLs más limpias
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'Admin.html'));
});
app.get('/estadisticas', (req, res) => {
  res.sendFile(path.join(__dirname, 'estadisticas.html'));
});
app.get('/cotizador', (req, res) => {
  res.sendFile(path.join(__dirname, 'cotizador1.1.html'));
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

app.post('/pedidos', async (req, res) => {
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

// Cambiar status
app.put('/pedidos/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pedido = await Pedido.findOneAndUpdate({ id: id }, { status: req.body.status }, { new: true });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(pedido);
  } catch (error) {
    console.error("Error al actualizar pedido:", error);
    res.status(500).json({ error: 'Error al actualizar pedido' });
  }
});

// Editar pedido completo (SOLO ADMIN)
app.put('/pedidos/edit/:id', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });
  
  try {
    const id = parseInt(req.params.id);
    const pedido = await Pedido.findOneAndUpdate(
      { id: id }, 
      {
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
      }, 
      { new: true }
    );
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(pedido);
  } catch (error) {
    console.error("Error al editar pedido completo:", error);
    res.status(500).json({ error: 'Error al editar pedido completo' });
  }
});

// Eliminar pedido (SOLO ADMIN)
app.delete('/pedidos/:id', authMiddleware, async (req, res) => {
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Permisos insuficientes' });

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