const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());


mongoose.connect("mongodb://127.0.0.1:27017/paellaDB");

// 📦 Modelo
const PedidoSchema = new mongoose.Schema({
  folio: String,
  tipo: String,
  cliente: String,      // legacy
  nombre: String,       // frontend actual
  telefono: String,
  hora: String,         // legacy
  horaEntrega: String,  // frontend actual
  entrega: String,      // legacy
  tipoEntrega: String,  // frontend actual
  items: Array,         // legacy
  itemsDetalle: Array,  // frontend actual
  extras: Array,
  notas: String,
  direccion: String,
  distancia: Number,
  costoKm: Number,
  costoFijo: Number,
  total: Number,
  status: { type: String, default: "Pendiente" },
  fechaEntrega: String,
  creadoEn: { type: Date, default: Date.now }
}, { strict: false });   // ← permite cualquier campo extra sin descartar

const Pedido = mongoose.model("Pedido", PedidoSchema);

// ✅ Guardar pedido
app.post("/pedidos", async (req, res) => {
  try {
    const pedido = new Pedido(req.body);
    await pedido.save();
    res.send("Pedido guardado en DB");
  } catch (err) {
    res.status(500).send("Error al guardar");
  }
});

// 📊 Obtener pedidos
app.get("/pedidos", async (req, res) => {
  const pedidos = await Pedido.find().sort({ creadoEn: -1 });
  res.json(pedidos);
});

// 📅 Filtrar por fechas
app.get("/pedidos/fecha", async (req, res) => {
  const { inicio, fin } = req.query;

  const pedidos = await Pedido.find({
    creadoEn: {
      $gte: new Date(inicio),
      $lte: new Date(fin)
    }
  });

  res.json(pedidos);
});

app.listen(3001, () => {
  console.log("Servidor corriendo en http://localhost:3001");
});