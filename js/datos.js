/* Funciones compartidas entre la tienda y el panel de administración */
(function () {
  const BORRADOR = "distri_borrador_v1";

  const CATEGORIAS = {
    "Medicamentos":         { color: "#c62a35", glifo: "capsula" },
    "Insumos médicos":      { color: "#1f6fd1", glifo: "mas" },
    "Aseo personal":        { color: "#0f9d9a", glifo: "gota" },
    "Hogar y cacharrería":  { color: "#e07a10", glifo: "estrella" },
    "Papelería":            { color: "#7b3fc4", glifo: "hoja" },
    "Enlatados":            { color: "#b8860b", glifo: "trigo" }
  };
  const PALETA_EXTRA = ["#7a4f2a", "#3d5a80", "#8a3b5c", "#4f6d3a"];

  function infoCategoria(nombre) {
    if (CATEGORIAS[nombre]) return CATEGORIAS[nombre];
    let h = 0;
    for (const c of String(nombre)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return { color: PALETA_EXTRA[h % PALETA_EXTRA.length], glifo: "estrella" };
  }

  const GLIFOS = {
    capsula: '<g transform="rotate(-40 50 50)"><path d="M38 34h12v32H38a16 16 0 0 1 0-32z"/><path d="M50 34h12a16 16 0 0 1 0 32H50z" opacity=".45"/></g>',
    mas: '<path d="M44 30h12v14h14v12H56v14H44V56H30V44h14z"/>',
    hoja: '<path d="M50 24c16 8 22 24 14 40-6 10-16 12-14 12-2 0-8-2-14-12-8-16-2-32 14-40zm-1 10v40h2V34z"/>',
    gota: '<path d="M50 24c10 16 20 26 20 38a20 20 0 0 1-40 0c0-12 10-22 20-38z"/>',
    escudo: '<path d="M50 24l22 8v16c0 14-10 24-22 28-12-4-22-14-22-28V32z"/>',
    estrella: '<path d="M50 24l7 16 17 2-13 11 4 17-15-9-15 9 4-17-13-11 17-2z"/>',
    trigo: '<path d="M49 30h2v46h-2zM50 30c6 2 8 8 6 12-6-2-8-8-6-12zm0 0c-6 2-8 8-6 12 6-2 8-8 6-12zm0 12c6 2 8 8 6 12-6-2-8-8-6-12zm0 0c-6 2-8 8-6 12 6-2 8-8 6-12zm0 12c6 2 8 8 6 12-6-2-8-8-6-12zm0 0c-6 2-8 8-6 12 6-2 8-8 6-12z"/>'
  };

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* Ilustración tipo vitral para productos sin foto */
  function ilustracion(p) {
    const { color, glifo } = infoCategoria(p.categoria);
    const nombre = esc(p.nombre).slice(0, 28);
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="#fff8ec"/>
        <circle cx="50" cy="48" r="34" fill="${color}" opacity=".14"/>
        <circle cx="50" cy="48" r="24" fill="#fff" stroke="${color}" stroke-width="1.5"/>
        <circle cx="22" cy="20" r="3" fill="${color}" opacity=".35"/><circle cx="80" cy="26" r="2" fill="${color}" opacity=".35"/><circle cx="78" cy="70" r="2.5" fill="${color}" opacity=".3"/>
        <g fill="${color}" transform="translate(50 48) scale(.62) translate(-50 -50)">${GLIFOS[glifo]}</g>
        <text x="50" y="90" text-anchor="middle" font-family="Georgia,serif" font-size="6.4" fill="#2b2620">${nombre}</text>
      </svg>`);
  }

  function imagenDe(p) { return p.imagen ? p.imagen : ilustracion(p); }

  function precioTexto(p) {
    if (p.precio === null || p.precio === undefined || p.precio === "") return null;
    return "$" + Number(p.precio).toLocaleString("es-CO", { maximumFractionDigits: 0 });
  }

  async function cargarPublicado() {
    const r = await fetch("productos.json?v=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("No se pudo leer productos.json");
    return r.json();
  }

  function leerBorrador() {
    try { const t = localStorage.getItem(BORRADOR); return t ? JSON.parse(t) : null; } catch { return null; }
  }
  function guardarBorrador(datos) {
    try { localStorage.setItem(BORRADOR, JSON.stringify(datos)); return true; }
    catch { return false; }
  }
  function borrarBorrador() { try { localStorage.removeItem(BORRADOR); } catch {} }

  /* Devuelve { datos, esBorrador } */
  async function cargarProductos() {
    const b = leerBorrador();
    if (b && Array.isArray(b.productos)) return { datos: b, esBorrador: true };
    return { datos: await cargarPublicado(), esBorrador: false };
  }

  function categoriasDe(productos) {
    const orden = Object.keys(CATEGORIAS);
    const set = [...new Set(productos.map(p => p.categoria))];
    return set.sort((a, b) => {
      const ia = orden.indexOf(a), ib = orden.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
  }

  function slug(s) {
    return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  }

  /* Detecta usuario/repositorio cuando la página corre en USUARIO.github.io/REPO */
  function repoGithub() {
    const cfg = (window.DISTRI && window.DISTRI.github) || {};
    let usuario = cfg.usuario, repositorio = cfg.repositorio;
    const host = location.hostname;
    if (!usuario && host.endsWith(".github.io")) usuario = host.replace(".github.io", "");
    if (!repositorio && host.endsWith(".github.io")) {
      const seg = location.pathname.split("/").filter(Boolean)[0];
      repositorio = seg && !seg.endsWith(".html") ? seg : host;
    }
    return { usuario: usuario || "", repositorio: repositorio || "", rama: cfg.rama || "main" };
  }

  window.Distri = {
    CATEGORIAS, infoCategoria, ilustracion, imagenDe, precioTexto, esc, slug,
    cargarPublicado, cargarProductos, leerBorrador, guardarBorrador, borrarBorrador,
    categoriasDe, repoGithub
  };
})();
