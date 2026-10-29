/* Panel de administración: agregar, editar, eliminar y publicar productos */
(function () {
  const C = window.DISTRI, D = window.Distri;
  const $ = s => document.querySelector(s);
  const SES = "distri_admin_ok", TOK = "distri_gh_token", GHCFG = "distri_gh_cfg";

  let publicado = null;   // lo que está en productos.json
  let estado = null;      // copia de trabajo
  let fotoActual = "";    // imagen del formulario (ruta o data:)
  let confirmando = null; // id del producto con "¿Eliminar?" abierto

  /* ---------- Entrada ---------- */
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
               set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } },
               set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
               del: k => { try { localStorage.removeItem(k); } catch {} } };

  $("#formEntrada").addEventListener("submit", e => {
    e.preventDefault();
    if ($("#clave").value === String(C.claveAdmin)) { ss.set(SES, "1"); entrar(); }
    else { $("#errorClave").hidden = false; $("#clave").select(); }
  });
  if (ss.get(SES) === "1") entrar();

  async function entrar() {
    $("#entrada").hidden = true; $("#app").hidden = false;
    try { publicado = await D.cargarPublicado(); }
    catch { publicado = { productos: [] }; aviso("No se pudo leer productos.json publicado"); }
    const b = D.leerBorrador();
    estado = b && Array.isArray(b.productos) ? b : clonar(publicado);
    iniciarGithub();
    pintarTodo();
  }

  const clonar = o => JSON.parse(JSON.stringify(o));
  const hoy = () => new Date().toISOString().slice(0, 10);

  function cambio() {
    estado.actualizado = hoy();
    if (!D.guardarBorrador(estado)) aviso("El navegador no tiene espacio: publique ahora o use fotos más pequeñas");
    pintarTodo();
  }

  function hayPendientes() {
    const a = clonar(estado), b = clonar(publicado); delete a.actualizado; delete b.actualizado;
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  /* ---------- Pintar ---------- */
  function pintarTodo() { pintarEstado(); pintarLista(); pintarCategorias(); }

  function pintarEstado() {
    const p = hayPendientes();
    $("#estado").classList.toggle("pendiente", p);
    $("#estadoTitulo").textContent = p ? "Hay cambios sin publicar" : "Todo publicado";
    $("#estadoTexto").textContent = p
      ? "Por ahora solo se ven en este equipo. Pulse “Publicar en GitHub” para que todos los vean."
      : "El catálogo coincide con la página publicada.";
    $("#btnDescartar").hidden = !p;
    if (!p) D.borrarBorrador();
  }

  function pintarCategorias() {
    $("#listaCategorias").innerHTML = D.categoriasDe(estado.productos).map(c => `<option value="${D.esc(c)}">`).join("")
      + Object.keys(D.CATEGORIAS).filter(c => !estado.productos.some(p => p.categoria === c)).map(c => `<option value="${D.esc(c)}">`).join("");
  }

  const normal = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function pintarLista() {
    const q = normal($("#buscarAdmin").value).trim(), f = $("#filtroOrigen").value;
    const todos = estado.productos;
    const lista = todos.filter(p => f === "todos" || (p.origen || "propio") === f)
      .filter(p => !q || normal(`${p.nombre} ${p.presentacion} ${p.categoria}`).includes(q));
    const nSug = todos.filter(p => p.origen === "sugerido").length;
    $("#total").textContent = `${todos.length} en total · ${nSug} sugeridos`;
    $("#borrarSugeridos").hidden = nSug === 0;
    const ids = new Set(publicado.productos.map(p => p.id));
    $("#lista").innerHTML = lista.map(p => {
      const ins = !ids.has(p.id) ? '<b class="insignia nuevo">Nuevo</b>'
        : p.origen === "sugerido" ? '<b class="insignia sugerido">Sugerido</b>' : '<b class="insignia propio">Propio</b>';
      const precio = D.precioTexto(p);
      const acc = confirmando === p.id
        ? `<span>¿Eliminar?</span><button class="mini rojo-lleno" data-acc="si">Sí, eliminar</button><button class="mini" data-acc="no">No</button>`
        : `<button class="mini" data-acc="foto">Cambiar foto</button>${p.imagen ? '<button class="mini" data-acc="sinfoto">Quitar foto</button>' : ""}<button class="mini" data-acc="editar">Editar</button><button class="mini rojo" data-acc="eliminar">Eliminar</button>`;
      return `<li data-id="${D.esc(p.id)}"><img src="${D.imagenDe(p)}" alt="">
        <div><strong>${D.esc(p.nombre)}</strong><small>${D.esc(p.presentacion)} · ${D.esc(p.categoria)}${precio ? " · " + precio : ""}</small> ${ins}</div>
        <div class="acciones-fila">${acc}</div></li>`;
    }).join("") || `<li><span></span><small>No hay productos con ese filtro.</small></li>`;
  }

  $("#buscarAdmin").addEventListener("input", pintarLista);
  $("#filtroOrigen").addEventListener("change", pintarLista);

  $("#lista").addEventListener("click", e => {
    const b = e.target.closest("button[data-acc]"); if (!b) return;
    const id = b.closest("li").dataset.id;
    const acc = b.dataset.acc;
    if (acc === "eliminar") { confirmando = id; pintarLista(); }
    else if (acc === "no") { confirmando = null; pintarLista(); }
    else if (acc === "si") {
      const p = estado.productos.find(x => x.id === id);
      estado.productos = estado.productos.filter(x => x.id !== id);
      confirmando = null;
      if (form.pid.value === id) limpiarForm();
      cambio(); aviso(`Eliminado: ${p ? p.nombre : ""}`);
    }
    else if (acc === "editar") editar(id);
    else if (acc === "foto") { fotoFilaId = id; $("#fotoFila").value = ""; $("#fotoFila").click(); }
    else if (acc === "sinfoto") {
      const p = estado.productos.find(x => x.id === id);
      p.imagen = ""; cambio(); aviso(`Foto quitada: ${p.nombre}`);
    }
  });

  let fotoFilaId = null;
  $("#fotoFila").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f || !fotoFilaId) return;
    const p = estado.productos.find(x => x.id === fotoFilaId); if (!p) return;
    try { p.imagen = await reducirImagen(f, 800, 0.82); cambio(); aviso(`Foto cambiada: ${p.nombre}. Pulse “Publicar en GitHub”.`); }
    catch { aviso("No se pudo leer esa imagen"); }
    fotoFilaId = null;
  });

  let confirmSug = false;
  $("#borrarSugeridos").addEventListener("click", () => {
    if (!confirmSug) {
      confirmSug = true; $("#borrarSugeridos").textContent = "¿Seguro? Pulse otra vez para eliminar todos los sugeridos";
      setTimeout(() => { confirmSug = false; $("#borrarSugeridos").textContent = "Eliminar todos los sugeridos"; }, 5000);
      return;
    }
    const n = estado.productos.filter(p => p.origen === "sugerido").length;
    estado.productos = estado.productos.filter(p => p.origen !== "sugerido");
    confirmSug = false; $("#borrarSugeridos").textContent = "Eliminar todos los sugeridos";
    cambio(); aviso(`${n} productos sugeridos eliminados`);
  });

  /* ---------- Formulario ---------- */
  const form = $("#formProducto");

  function pintarFoto() {
    const v = $("#fotoVista");
    const nombre = form.nombre.value || "Producto", cat = form.categoria.value || "";
    if (fotoActual) { v.className = "foto-vista"; v.innerHTML = `<img src="${fotoActual}" alt="">`; }
    else if (form.nombre.value) { v.className = "foto-vista ilus"; v.innerHTML = `<img src="${D.ilustracion({ nombre, categoria: cat })}" alt="">`; }
    else { v.className = "foto-vista"; v.innerHTML = "<span>Sin foto</span>"; }
  }
  form.nombre.addEventListener("input", pintarFoto);
  form.categoria.addEventListener("input", pintarFoto);

  function editar(id) {
    const p = estado.productos.find(x => x.id === id); if (!p) return;
    form.pid.value = p.id; form.nombre.value = p.nombre; form.presentacion.value = p.presentacion || "";
    form.categoria.value = p.categoria; form.precio.value = p.precio ?? ""; form.descripcion.value = p.descripcion || "";
    form.destacado.checked = !!p.destacado; fotoActual = p.imagen || "";
    $("#tituloForm").textContent = "Editar producto"; $("#btnGuardar").textContent = "Guardar cambios";
    $("#btnCancelar").hidden = false; $("#cajaForm").classList.add("editando");
    pintarFoto(); $("#cajaForm").scrollIntoView({ behavior: "smooth", block: "start" }); form.nombre.focus({ preventScroll: true });
  }

  function limpiarForm() {
    form.reset(); form.pid.value = ""; fotoActual = ""; $("#fotoArchivo").value = "";
    $("#tituloForm").textContent = "Agregar producto"; $("#btnGuardar").textContent = "Agregar producto";
    $("#btnCancelar").hidden = true; $("#cajaForm").classList.remove("editando"); pintarFoto();
  }
  $("#btnCancelar").addEventListener("click", limpiarForm);
  $("#quitarFoto").addEventListener("click", () => { fotoActual = ""; $("#fotoArchivo").value = ""; pintarFoto(); });

  $("#fotoArchivo").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try { fotoActual = await reducirImagen(f, 800, 0.82); pintarFoto(); }
    catch { aviso("No se pudo leer esa imagen"); }
  });

  function reducirImagen(archivo, max, calidad) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(archivo), img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(c.toDataURL("image/jpeg", calidad));
      };
      img.onerror = mal; img.src = url;
    });
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const datos = {
      nombre: d.nombre.trim(), presentacion: (d.presentacion || "").trim(), categoria: d.categoria.trim(),
      precio: d.precio === "" ? null : Number(d.precio), descripcion: (d.descripcion || "").trim(),
      destacado: !!form.destacado.checked, imagen: fotoActual
    };
    if (d.pid) {
      const p = estado.productos.find(x => x.id === d.pid);
      Object.assign(p, datos);
      aviso("Cambios guardados");
    } else {
      let id = D.slug(`${datos.nombre}-${datos.presentacion}`) || "producto", base = id, n = 2;
      while (estado.productos.some(p => p.id === id)) id = `${base}-${n++}`;
      estado.productos.unshift({ id, ...datos, origen: "propio" });
      aviso("Producto agregado");
    }
    limpiarForm(); cambio();
  });

  /* ---------- Descargar / descartar ---------- */
  $("#btnDescargar").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(estado, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "productos.json";
    document.body.appendChild(a); a.click(); a.remove();
    if (estado.productos.some(p => (p.imagen || "").startsWith("data:")))
      aviso("Ojo: las fotos nuevas van dentro del archivo. Para guardarlas aparte use “Publicar en GitHub”.");
  });
  let confirmDesc = false;
  $("#btnDescartar").addEventListener("click", () => {
    if (!confirmDesc) { confirmDesc = true; $("#btnDescartar").textContent = "¿Seguro? Pulse otra vez"; setTimeout(() => { confirmDesc = false; $("#btnDescartar").textContent = "Descartar cambios"; }, 5000); return; }
    confirmDesc = false; $("#btnDescartar").textContent = "Descartar cambios";
    D.borrarBorrador(); estado = clonar(publicado); limpiarForm(); pintarTodo(); aviso("Cambios descartados");
  });

  /* ---------- GitHub ---------- */
  function iniciarGithub() {
    const auto = D.repoGithub();
    let guardado = {}; try { guardado = JSON.parse(ls.get(GHCFG)) || {}; } catch {}
    $("#ghUsuario").value = guardado.usuario || auto.usuario;
    $("#ghRepo").value = guardado.repositorio || auto.repositorio;
    $("#ghRama").value = guardado.rama || auto.rama || "main";
    const t = ls.get(TOK); if (t) { $("#ghToken").value = t; $("#ghRecordar").checked = true; }
  }

  function b64Texto(str) {
    const bytes = new TextEncoder().encode(str); let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function gh(cfg, ruta, opciones = {}) {
    const r = await fetch(`https://api.github.com/repos/${cfg.usuario}/${cfg.repositorio}/contents/${ruta}` + (opciones.method ? "" : `?ref=${encodeURIComponent(cfg.rama)}`), {
      ...opciones,
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
    });
    if (r.status === 404 && !opciones.method) return null;
    if (!r.ok) {
      let m = ""; try { m = (await r.json()).message; } catch {}
      if (r.status === 401) throw new Error("El token no es válido o expiró.");
      if (r.status === 403) throw new Error("El token no tiene permiso de escritura (Contents: Read and write).");
      if (r.status === 404) throw new Error("No se encontró el repositorio. Revise usuario y nombre.");
      throw new Error(`GitHub respondió ${r.status}: ${m}`);
    }
    return r.json();
  }

  $("#btnPublicar").addEventListener("click", async () => {
    const cfg = { usuario: $("#ghUsuario").value.trim(), repositorio: $("#ghRepo").value.trim(), rama: $("#ghRama").value.trim() || "main", token: $("#ghToken").value.trim() };
    if (!cfg.usuario || !cfg.repositorio || !cfg.token) {
      $("#cajaGithub").scrollIntoView({ behavior: "smooth" });
      aviso("Complete usuario, repositorio y token de GitHub"); return;
    }
    ls.set(GHCFG, JSON.stringify({ usuario: cfg.usuario, repositorio: cfg.repositorio, rama: cfg.rama }));
    if ($("#ghRecordar").checked) ls.set(TOK, cfg.token); else ls.del(TOK);

    const btn = $("#btnPublicar"); btn.disabled = true;
    try {
      const salida = clonar(estado);
      const nuevas = salida.productos.filter(p => (p.imagen || "").startsWith("data:"));
      let i = 0;
      for (const p of nuevas) {
        btn.textContent = `Subiendo fotos ${++i}/${nuevas.length}…`;
        const ruta = `img/productos/${p.id}-${Date.now().toString(36)}.jpg`;
        await gh(cfg, ruta, { method: "PUT", body: JSON.stringify({ message: `Foto de ${p.nombre}`, content: p.imagen.split(",")[1], branch: cfg.rama }) });
        p.imagen = ruta;
      }
      btn.textContent = "Publicando catálogo…";
      salida.actualizado = hoy();
      const actual = await gh(cfg, "productos.json");
      await gh(cfg, "productos.json", { method: "PUT", body: JSON.stringify({
        message: `Catálogo actualizado (${salida.productos.length} productos)`,
        content: b64Texto(JSON.stringify(salida, null, 1)), branch: cfg.rama, ...(actual ? { sha: actual.sha } : {})
      }) });
      // Borrar de la web las fotos que ya no usa ningún producto
      let borradas = 0;
      try {
        const usadas = new Set(salida.productos.map(p => p.imagen).filter(Boolean));
        const archivos = (await gh(cfg, "img/productos")) || [];
        const sobran = archivos.filter(a => a.type === "file" && !usadas.has(a.path));
        for (const a of sobran) {
          btn.textContent = `Borrando fotos que no se usan ${++borradas}/${sobran.length}…`;
          await gh(cfg, a.path, { method: "DELETE", body: JSON.stringify({ message: `Foto eliminada: ${a.name}`, sha: a.sha, branch: cfg.rama }) });
        }
      } catch { /* si falla la limpieza, el catálogo ya quedó publicado */ }
      publicado = salida; estado = clonar(salida); D.borrarBorrador(); pintarTodo();
      aviso("¡Publicado! La página se actualiza en 1 o 2 minutos.");
    } catch (err) {
      aviso(err.message || "No se pudo publicar");
    } finally {
      btn.disabled = false; btn.textContent = "Publicar en GitHub";
    }
  });

  let tAviso;
  function aviso(t) {
    const el = $("#toast"); el.textContent = t; el.classList.add("ver");
    clearTimeout(tAviso); tAviso = setTimeout(() => el.classList.remove("ver"), 3600);
  }
})();
