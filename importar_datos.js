const fs = require('fs');
const mongoose = require('mongoose');

// =========================================================================
// ⚠️ ATENCIÓN JORGE: CAMBIA LA PALABRA "TU_CONTRASEÑA_AQUI" por tu verdadera contraseña
const MONGO_URI = 'mongodb+srv://adminlapaella:lapaella2026@cluster0.t8gzhqx.mongodb.net/paelladb?retryWrites=true&w=majority';
// =========================================================================

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

async function importar() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado a MongoDB");

    if (fs.existsSync('pedidos.json')) {
      const data = JSON.parse(fs.readFileSync('pedidos.json', 'utf8'));

      console.log(`Encontrados ${data.length} pedidos locales. Importando...`);
      for (const p of data) {
        const existe = await Pedido.findOne({ id: p.id });
        if (!existe) {
          await new Pedido(p).save();
        }
      }
      console.log(`🚀 ¡Éxito! Migración completada de ${data.length} pedidos a la Nube.`);
    } else {
      console.log("No se encontró pedidos.json, nada que importar.");
    }
  } catch (error) {
    console.error("❌ Error importando datos:", error);
  } finally {
    process.exit(0);
  }
}

importar();
