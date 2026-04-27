// =====================================================
//   CONFIGURACIÓN DE DESTINATARIOS WHATSAPP
//   Sistema PAELLAND — Resumen diario 3:30 PM
// =====================================================
//
// PASOS PARA ACTIVAR CADA NÚMERO (solo se hace una vez):
//
//   1. Desde el WhatsApp del destinatario, envía este mensaje
//      al número: +34 644 59 22 40
//      → "I allow callmebot to send me messages"
//
//   2. CallMeBot responderá con una API key única.
//
//   3. Copia esa API key en el campo "apikey" de abajo.
//
// Formato del teléfono: con código de país, sin espacios ni guiones.
//   Ejemplo México: +5219991211200
//
// =====================================================

module.exports = {
  destinatarios: [
    {
      nombre: 'Administrador Jorge',
      telefono: '+5219991211200',
      apikey: '1911736'
    },
    {
      nombre: 'Admin Luis',
      telefono: '+5219991106815',
      apikey: '7358212'
    },
    {
      nombre: 'Admin Amir',
      telefono: '+5219993904135',
      apikey: '8328121'
    },
    {
      nombre: 'Admin Abraham',
      telefono: '+5215219993868915',
      apikey: '8547496'
    },
    // ── Agrega más destinatarios copiando el bloque de abajo ──
    // {
    //   nombre: 'Encargado de Producción',
    //   telefono: '+521XXXXXXXXXX',
    //   apikey: 'TU_API_KEY_AQUI'
    // },
  ]
};
