const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());


mongoose.connect("mongodb://127.0.0.1:27017/paellaDB");

// 📦 Modelo
const Pedido = mongoose.model("Pedido", {
  tipo: String,
  cliente: String,
  telefono: String,
  fecha: String,
  hora: String,
  entrega: String,
  items: Array,
  extras: Array,
  notas: String,
  direccion: String,
  distancia: Number,
  total: Number,
  creadoEn: { type: Date, default: Date.now }
});

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