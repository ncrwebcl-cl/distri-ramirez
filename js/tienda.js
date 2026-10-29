/* Lógica de la página pública: catálogo, búsqueda y pedido por WhatsApp */
(function () {
  const C = window.DISTRI, D = window.Distri;
  const PEDIDO = "distri_pedido_v1";
  const $ = s => document.querySelector(s);

  let productos = [];
  let categoria = "Todas";
  let pedido = leerPedido();

  /* ---------- Datos del negocio en la página ---------- */
  document.querySelectorAll("[data-cfg]").forEach(el => {
    const v = C[el.dataset.cfg];
    if (v) el.textContent = v;
  });
  $("#anio").textContent = new Date().getFullYear();
  const wa = (texto) => `https://wa.me/${C.whatsapp}${texto ? "?text=" + encodeURIComponent(texto) : ""}`;
  const saludo = `Hola ${C.nombre}, quiero información para surtir mi tienda.`;
  $("#waPortada").href = wa(saludo);
  $("#waFlotante").href = wa(saludo);
  $("#lnkTel").href = "tel:+" + C.whatsapp;
  $("#lnkCorreo").href = "mailto:" + C.correo;

  /* ---------- Pedido guardado en el navegador ---------- */
  function leerPedido() {
    try { return JSON.parse(localStorage.getItem(PEDIDO)) || {}; } catch { return {}; }
  }
  function guardarPedido() {
    try { localStorage.setItem(PEDIDO, JSON.stringify(pedido)); } catch {}
    pintarContador();
  }
  function pintarContador() {
    const n = Object.values(pedido).reduce((a, b) => a + b, 0);
    $("#contador").textContent = n;
  }

  /* ---------- Catálogo ---------- */
  async function iniciar() {
    try {
      const { datos, esBorrador } = await D.cargarProductos();
      productos = datos.productos || [];
      $("#avisoBorrador").hidden = !esBorrador;
    } catch (e) {
      $("#rejilla").innerHTML = `<p class="vacio">No se pudo cargar el catálogo. Si abrió el archivo directamente en el computador, publíquelo en GitHub Pages o ábralo con un servidor local.</p>`;
      return;
    }
    // quitar del pedido productos que ya no existen
    for (const id of Object.keys(pedido)) if (!productos.some(p => p.id === id)) delete pedido[id];
    guardarPedido();
    pintarCategorias();
    pintarProductos();
  }

  function pintarCategorias() {
    const cats = D.categoriasDe(productos);
    const chips = [["Todas", productos.length, "#18233f"], ...cats.map(c => [c, productos.filter(p => p.categoria === c).length, D.infoCategoria(c).color])];
    $("#categorias").innerHTML = chips.map(([c, n, col]) =>
      `<button class="chip" role="tab" aria-selected="${c === categoria}" data-cat="${D.esc(c)}" style="--c:${col}"><i></i>${D.esc(c)} <small>${n}</small></button>`
    ).join("");
  }

  $("#categorias").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    categoria = b.dataset.cat;
    document.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-selected", x === b));
    pintarProductos();
  });

  const normal = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  $("#buscar").addEventListener("input", pintarProductos);

  function pintarProductos() {
    const q = normal($("#buscar").value).trim();
    const lista = productos
      .filter(p => categoria === "Todas" || p.categoria === categoria)
      .filter(p => !q || normal(`${p.nombre} ${p.presentacion} ${p.categoria} ${p.descripcion}`).includes(q))
      .sort((a, b) => (b.destacado - a.destacado) || (!!b.imagen - !!a.imagen));

    $("#vacio").hidden = lista.length > 0;
    $("#rejilla").innerHTML = lista.map(p => {
      const col = D.infoCategoria(p.categoria).color;
      const precio = D.precioTexto(p);
      const enPedido = pedido[p.id] || 0;
      return `<article class="tarjeta" style="--c:${col}" data-id="${D.esc(p.id)}">
        ${p.destacado ? '<span class="destacado">Destacado</span>' : ""}
        <div class="tarjeta-marco"><img src="${D.imagenDe(p)}" alt="${D.esc(p.nombre)}" loading="lazy" class="${p.imagen ? "" : "ilus"}"></div>
        <p class="etiqueta-cat">${D.esc(p.categoria)}</p>
        <h3>${D.esc(p.nombre)}</h3>
        <p class="pres">${D.esc(p.presentacion)}</p>
        <p class="precio ${precio ? "" : "consultar"}">${precio || "Precio por WhatsApp"}</p>
        <div class="comprar">
          <div class="cantidad"><button type="button" data-acc="menos" aria-label="Menos">−</button><input type="number" min="1" value="1" aria-label="Cantidad"><button type="button" data-acc="mas" aria-label="Más">+</button></div>
          <button type="button" class="agregar ${enPedido ? "listo" : ""}" data-acc="agregar">${enPedido ? `En pedido (${enPedido})` : "Agregar"}</button>
        </div>
      </article>`;
    }).join("");
  }

  $("#rejilla").addEventListener("click", e => {
    const b = e.target.closest("button[data-acc]"); if (!b) return;
    const t = b.closest(".tarjeta"), inp = t.querySelector("input");
    const acc = b.dataset.acc;
    if (acc === "menos") inp.value = Math.max(1, (+inp.value || 1) - 1);
    if (acc === "mas") inp.value = (+inp.value || 0) + 1;
    if (acc === "agregar") {
      const id = t.dataset.id, n = Math.max(1, Math.floor(+inp.value || 1));
      pedido[id] = (pedido[id] || 0) + n;
      guardarPedido();
      b.classList.add("listo"); b.textContent = `En pedido (${pedido[id]})`;
      inp.value = 1;
      const bp = $("#abrirPedido"); bp.classList.remove("salta"); void bp.offsetWidth; bp.classList.add("salta");
      aviso(`Agregado: ${productos.find(p => p.id === id).nombre}`);
    }
  });

  /* ---------- Panel del pedido ---------- */
  const panel = $("#panelPedido"), velo = $("#velo");
  function abrir() { pintarPedido(); panel.classList.add("abierto"); panel.setAttribute("aria-hidden", "false"); velo.hidden = false; }
  function cerrar() { panel.classList.remove("abierto"); panel.setAttribute("aria-hidden", "true"); velo.hidden = true; }
  $("#abrirPedido").addEventListener("click", abrir);
  $("#cerrarPedido").addEventListener("click", cerrar);
  velo.addEventListener("click", cerrar);
  document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });

  function lineasPedido() {
    return Object.entries(pedido).map(([id, n]) => ({ p: productos.find(x => x.id === id), n })).filter(x => x.p);
  }

  function pintarPedido() {
    const l = lineasPedido();
    $("#listaPedido").innerHTML = l.length ? l.map(({ p, n }) => `
      <div class="linea" data-id="${D.esc(p.id)}">
        <img src="${D.imagenDe(p)}" alt="">
        <div><strong>${D.esc(p.nombre)}</strong><small>${D.esc(p.presentacion)}</small></div>
        <div class="cantidad"><button type="button" data-acc="menos" aria-label="Menos">−</button><input type="number" min="0" value="${n}" aria-label="Cantidad"><button type="button" data-acc="mas" aria-label="Más">+</button></div>
      </div>`).join("")
      : `<p class="panel-vacio">Tu pedido está vacío.<br>Agrega productos desde el catálogo.</p>`;
  }

  function cambiarCantidad(id, n) {
    if (n <= 0) delete pedido[id]; else pedido[id] = n;
    guardarPedido(); pintarPedido(); pintarProductos();
  }
  $("#listaPedido").addEventListener("click", e => {
    const b = e.target.closest("button[data-acc]"); if (!b) return;
    const id = b.closest(".linea").dataset.id;
    cambiarCantidad(id, (pedido[id] || 0) + (b.dataset.acc === "mas" ? 1 : -1));
  });
  $("#listaPedido").addEventListener("change", e => {
    if (e.target.tagName !== "INPUT") return;
    cambiarCantidad(e.target.closest(".linea").dataset.id, Math.floor(+e.target.value || 0));
  });
  $("#vaciarPedido").addEventListener("click", () => {
    pedido = {}; guardarPedido(); pintarPedido(); pintarProductos();
  });

  function textoPedido(f) {
    const l = lineasPedido();
    const filas = l.map(({ p, n }) => `• ${n} x ${p.nombre} (${p.presentacion})`).join("\n");
    return `*Nuevo pedido — ${C.nombre}*\n\n` +
      `Tienda: ${f.tienda}\nNombre: ${f.nombre}\nDirección: ${f.direccion}` +
      (f.municipio ? `\nMunicipio: ${f.municipio}` : "") +
      `\n\n*Productos:*\n${filas}` +
      (f.nota ? `\n\nNota: ${f.nota}` : "") +
      `\n\nQuedo atento a la confirmación de precios. ¡Dios le bendiga!`;
  }

  function datosForm() {
    const f = $("#formPedido");
    if (!lineasPedido().length) { aviso("Agrega al menos un producto"); return null; }
    if (!f.reportValidity()) return null;
    return Object.fromEntries(new FormData(f));
  }

  $("#formPedido").addEventListener("submit", e => {
    e.preventDefault();
    const f = datosForm(); if (!f) return;
    window.open(wa(textoPedido(f)), "_blank", "noopener");
  });
  $("#enviarCorreo").addEventListener("click", () => {
    const f = datosForm(); if (!f) return;
    const asunto = `Pedido de ${f.tienda}`;
    location.href = `mailto:${C.correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(textoPedido(f).replace(/\*/g, ""))}`;
  });

  let tAviso;
  function aviso(t) {
    const el = $("#toast"); el.textContent = t; el.classList.add("ver");
    clearTimeout(tAviso); tAviso = setTimeout(() => el.classList.remove("ver"), 2200);
  }

  pintarContador();
  iniciar();
})();
