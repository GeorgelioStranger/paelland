// =====================================================
// GESTIÓN DE USUARIOS — Módulo compartido
// Se carga en todas las páginas del sistema
// =====================================================

(function () {
  const userRole    = localStorage.getItem('user_role') || '';
  const userName    = localStorage.getItem('user_name') || '';
  const authToken   = localStorage.getItem('auth_token') || '';

  // Ocultar link de usuarios si no es admin
  document.addEventListener('DOMContentLoaded', () => {
    const navU = document.getElementById('nav-usuarios');
    if (navU && userRole !== 'admin') navU.style.display = 'none';
  });

  // Inyectar modal HTML
  const modalHTML = `
  <div id="modalGestionUsuarios" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9000; align-items:center; justify-content:center; padding:20px;">
    <div style="background:white; border-radius:20px; padding:30px; width:100%; max-width:720px; max-height:90vh; overflow-y:auto; position:relative;">
      <button onclick="cerrarGestionUsuarios()" style="position:absolute; top:16px; right:20px; background:none; border:none; font-size:1.5rem; cursor:pointer; color:#9ca3af;">×</button>
      <h2 style="margin:0 0 4px 0; font-size:1.3rem;">👥 Gestión de Usuarios</h2>
      <p style="color:#6b7280; font-size:0.88rem; margin:0 0 18px 0;">Administra quién puede acceder al sistema y qué puede ver.</p>

      <button onclick="gu_abrirForm(null)" style="background:#D85A30; color:white; border:none; padding:9px 20px; border-radius:10px; font-weight:600; cursor:pointer; margin-bottom:16px; font-size:0.9rem;">+ Nuevo usuario</button>

      <div id="gu-tabla"></div>

      <div id="gu-form" style="display:none; background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:20px; margin-top:18px;">
        <h3 id="gu-form-titulo" style="margin:0 0 14px 0; font-size:1rem;">Nuevo usuario</h3>
        <input type="hidden" id="gu-id">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div>
            <label style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:4px;">Nombre</label>
            <input type="text" id="gu-nombre" placeholder="Ej: María" style="width:100%; padding:9px; border:1px solid #e2e8f0; border-radius:8px; font-size:0.9rem; box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:4px;">Usuario (login)</label>
            <input type="text" id="gu-username" placeholder="Ej: maria" style="width:100%; padding:9px; border:1px solid #e2e8f0; border-radius:8px; font-size:0.9rem; box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:4px;">Contraseña <span id="gu-pass-hint" style="color:#9ca3af; font-weight:400;">(vacío = no cambiar)</span></label>
            <input type="password" id="gu-password" placeholder="••••••••" style="width:100%; padding:9px; border:1px solid #e2e8f0; border-radius:8px; font-size:0.9rem; box-sizing:border-box;">
          </div>
          <div>
            <label style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:4px;">Rol</label>
            <select id="gu-role" style="width:100%; padding:9px; border:1px solid #e2e8f0; border-radius:8px; font-size:0.9rem; box-sizing:border-box;">
              <option value="empleado">Empleado</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-size:0.82rem; font-weight:600; display:block; margin-bottom:8px;">Permisos</label>
          <div style="display:flex; flex-wrap:wrap; gap:14px;">
            <label style="display:flex; align-items:center; gap:6px; font-size:0.88rem; cursor:pointer;"><input type="checkbox" id="gu-p-stats"> Ver Estadísticas</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:0.88rem; cursor:pointer;"><input type="checkbox" id="gu-p-finanzas"> Ver Finanzas</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:0.88rem; cursor:pointer;"><input type="checkbox" id="gu-p-produccion"> Ver Producción</label>
            <label style="display:flex; align-items:center; gap:6px; font-size:0.88rem; cursor:pointer;"><input type="checkbox" id="gu-p-editar"> Editar / Eliminar pedidos</label>
          </div>
        </div>
        <div style="display:flex; gap:10px;">
          <button onclick="gu_guardar()" style="background:#D85A30; color:white; border:none; padding:9px 22px; border-radius:8px; font-weight:600; cursor:pointer;">Guardar</button>
          <button onclick="gu_cancelarForm()" style="background:#e5e7eb; color:#374151; border:none; padding:9px 22px; border-radius:8px; font-weight:600; cursor:pointer;">Cancelar</button>
        </div>
        <p id="gu-error" style="color:#ef4444; font-size:0.83rem; margin-top:10px; display:none;"></p>
      </div>
    </div>
  </div>`;

  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  });

  let _guCache = [];

  function _authFetch(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${authToken}`;
    return fetch(url, options);
  }

  function _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
  }

  window.abrirGestionUsuarios = async function () {
    if (userRole !== 'admin') return;
    document.getElementById('modalGestionUsuarios').style.display = 'flex';
    gu_cancelarForm();
    await gu_cargar();
  };

  window.cerrarGestionUsuarios = function () {
    document.getElementById('modalGestionUsuarios').style.display = 'none';
  };

  async function gu_cargar() {
    try {
      const res = await _authFetch('/usuarios');
      _guCache = await res.json();
      gu_renderTabla();
    } catch (e) {
      document.getElementById('gu-tabla').innerHTML = '<p style="color:#ef4444;">Error al cargar usuarios.</p>';
    }
  }

  function gu_renderTabla() {
    const cont = document.getElementById('gu-tabla');
    if (!_guCache.length) { cont.innerHTML = '<p style="color:#6b7280; font-size:0.9rem;">No hay usuarios registrados.</p>'; return; }
    const ok  = v => v ? '<span style="color:#10b981;font-weight:700;">✓</span>' : '<span style="color:#d1d5db;">—</span>';
    const rows = _guCache.map(u => `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:9px 8px;font-weight:600;">${_escHtml(u.nombre)}</td>
        <td style="padding:9px 8px;color:#6b7280;font-size:0.83rem;">${_escHtml(u.username)}</td>
        <td style="padding:9px 8px;">
          <span style="padding:2px 10px;border-radius:50px;font-size:0.73rem;font-weight:700;background:${u.role==='admin'?'#fef3c7':'#f0f9ff'};color:${u.role==='admin'?'#92400e':'#0369a1'};">${u.role}</span>
        </td>
        <td style="padding:9px 8px;text-align:center;">${ok(u.permisos?.verEstadisticas)}</td>
        <td style="padding:9px 8px;text-align:center;">${ok(u.permisos?.verFinanzas)}</td>
        <td style="padding:9px 8px;text-align:center;">${ok(u.permisos?.verProduccion)}</td>
        <td style="padding:9px 8px;text-align:center;">${ok(u.permisos?.editarEliminarPedidos)}</td>
        <td style="padding:9px 8px;text-align:center;">
          <label style="cursor:pointer;font-size:0.82rem;display:inline-flex;align-items:center;gap:4px;">
            <input type="checkbox" ${u.activo?'checked':''} onchange="gu_toggleActivo('${u._id}',this.checked)"> Activo
          </label>
        </td>
        <td style="padding:9px 8px;white-space:nowrap;">
          <button onclick="gu_abrirForm('${u._id}')" style="background:#8b5cf6;color:white;border:none;padding:4px 11px;border-radius:6px;cursor:pointer;font-size:0.8rem;margin-right:4px;">✏️</button>
          <button onclick="gu_eliminar('${u._id}','${_escHtml(u.nombre)}')" style="background:#ef4444;color:white;border:none;padding:4px 11px;border-radius:6px;cursor:pointer;font-size:0.8rem;">🗑</button>
        </td>
      </tr>`).join('');

    cont.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:9px 8px;color:#64748b;font-weight:600;text-align:left;">Nombre</th>
            <th style="padding:9px 8px;color:#64748b;font-weight:600;text-align:left;">Usuario</th>
            <th style="padding:9px 8px;color:#64748b;font-weight:600;text-align:left;">Rol</th>
            <th style="padding:9px 8px;color:#64748b;font-weight:600;text-align:center;">Estadíst.</th>
            <th style="padding:9px 8px;color:#64748b;font-weight:600;text-align:center;">Finanzas</th>
            <th style="padding:9px 8px;color:#64748b;font-weight:600;text-align:center;">Producc.</th>
            <th style="padding:9px 8px;color:#64748b;font-weight:600;text-align:center;">Editar/Elim.</th>
            <th style="padding:9px 8px;color:#64748b;font-weight:600;text-align:center;">Estado</th>
            <th style="padding:9px 8px;color:#64748b;font-weight:600;text-align:left;">Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  window.gu_abrirForm = function (id) {
    const form = document.getElementById('gu-form');
    form.style.display = 'block';
    document.getElementById('gu-error').style.display = 'none';
    if (!id) {
      document.getElementById('gu-form-titulo').innerText = 'Nuevo usuario';
      document.getElementById('gu-id').value = '';
      document.getElementById('gu-nombre').value = '';
      document.getElementById('gu-username').value = '';
      document.getElementById('gu-username').disabled = false;
      document.getElementById('gu-password').value = '';
      document.getElementById('gu-role').value = 'empleado';
      ['gu-p-stats','gu-p-finanzas','gu-p-produccion','gu-p-editar'].forEach(id => document.getElementById(id).checked = false);
      document.getElementById('gu-pass-hint').style.display = 'none';
    } else {
      const u = _guCache.find(x => x._id === id);
      if (!u) return;
      document.getElementById('gu-form-titulo').innerText = `Editar: ${u.nombre}`;
      document.getElementById('gu-id').value = u._id;
      document.getElementById('gu-nombre').value = u.nombre;
      document.getElementById('gu-username').value = u.username;
      document.getElementById('gu-username').disabled = true;
      document.getElementById('gu-password').value = '';
      document.getElementById('gu-role').value = u.role;
      document.getElementById('gu-p-stats').checked     = !!u.permisos?.verEstadisticas;
      document.getElementById('gu-p-finanzas').checked  = !!u.permisos?.verFinanzas;
      document.getElementById('gu-p-produccion').checked= !!u.permisos?.verProduccion;
      document.getElementById('gu-p-editar').checked    = !!u.permisos?.editarEliminarPedidos;
      document.getElementById('gu-pass-hint').style.display = 'inline';
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  window.gu_cancelarForm = function () {
    const f = document.getElementById('gu-form');
    if (f) { f.style.display = 'none'; document.getElementById('gu-username').disabled = false; }
  };

  window.gu_guardar = async function () {
    const id       = document.getElementById('gu-id').value;
    const nombre   = document.getElementById('gu-nombre').value.trim();
    const username = document.getElementById('gu-username').value.trim();
    const password = document.getElementById('gu-password').value;
    const role     = document.getElementById('gu-role').value;
    const permisos = {
      verEstadisticas:      document.getElementById('gu-p-stats').checked,
      verFinanzas:          document.getElementById('gu-p-finanzas').checked,
      verProduccion:        document.getElementById('gu-p-produccion').checked,
      editarEliminarPedidos:document.getElementById('gu-p-editar').checked
    };
    const errEl = document.getElementById('gu-error');
    errEl.style.display = 'none';
    if (!nombre)           { errEl.innerText = 'El nombre es requerido.'; errEl.style.display = 'block'; return; }
    if (!id && !username)  { errEl.innerText = 'El usuario es requerido.'; errEl.style.display = 'block'; return; }
    if (!id && !password)  { errEl.innerText = 'La contraseña es requerida para un usuario nuevo.'; errEl.style.display = 'block'; return; }
    try {
      const body   = { nombre, role, permisos };
      if (!id) { body.username = username; body.password = password; }
      else if (password) { body.password = password; }
      const url    = id ? `/usuarios/${id}` : '/usuarios';
      const method = id ? 'PUT' : 'POST';
      const res    = await _authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data   = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      gu_cancelarForm();
      await gu_cargar();
    } catch (e) { errEl.innerText = e.message; errEl.style.display = 'block'; }
  };

  window.gu_toggleActivo = async function (id, activo) {
    try { await _authFetch(`/usuarios/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo }) }); }
    catch (e) { alert('Error al actualizar'); }
  };

  window.gu_eliminar = async function (id, nombre) {
    if (!confirm(`¿Eliminar al usuario "${nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res  = await _authFetch(`/usuarios/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      await gu_cargar();
    } catch (e) { alert('Error: ' + e.message); }
  };
})();
