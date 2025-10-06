
const SUPABASE_URL = 'https://zejzrujrspeoszpfbjce.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplanpydWpyc3Blb3N6cGZiamNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MDMyNDMsImV4cCI6MjA3NTE3OTI0M30.UAi4jQ0BH1hphW7OEh4JWP4hdVJ4CmvX6x4CyP2ak-U';
const CLOUDINARY_CLOUD_NAME = 'dvj68er8s';
const CLOUDINARY_UPLOAD_PRESET = 'red51_productos';

// FIX: Declare global variables for external libraries
declare var supabase: any;
declare var L: any;
declare var XLSX: any;

let carrito = [];
let supabaseClient = null;
let categoriaActual = 'todos';
let productos = [];
let productosAdmin = [];
let categorias = [];
let pedidos = [];
let inventario = [];
let movimientos = [];
let datosReporteActual = [];
let usuarioActual = null;
// FIX: Type configuracion as any to allow dynamic properties
let configuracion: any = {};
let estadoPedidoActual = 'todos';
let pedidosChannel = null;
let productoSeleccionado = null;
const estadosPosibles = ['pendiente_pago', 'pago_confirmado', 'en_preparacion', 'enviado', 'entregado', 'cancelado'];
let currentVariantPreviewElement = null;
let isLowStockFilterActive = false;
let isProcessingOrder = false;
const colorMap = {
    'rojo': '#ef4444', 'azul': '#3b82f6', 'verde': '#22c55e', 'negro': '#1f2937',
    'blanco': '#ffffff', 'amarillo': '#f59e0b', 'naranja': '#f97316', 'morado': '#8b5cf6',
    'rosa': '#ec4899', 'gris': '#6b7280', 'plata': '#d1d5db', 'dorado': '#ca8a04',
    'marrón': '#78350f', 'cafe': '#78350f'
};


async function inicializarSupabase() {
    // FIX: Add check for supabase object before using it.
    if (typeof supabase === 'undefined') {
        console.error("Supabase client is not loaded.");
        return;
    }
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await cargarConfiguracion();
    await cargarCategorias();
    await cargarProductos();
    await verificarSesion();
}

function setupGlobalEventListeners() {
    document.addEventListener('submit', (event) => {
        // Global handler for the checkout form to prevent duplicate listeners
        if (event.target && (event.target as HTMLElement).id === 'checkoutForm') {
            event.preventDefault();
            realizarPedido();
        }
    });
}

async function cargarConfiguracion() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('configuracion')
            .select('clave, valor');
        
        if (error) {
            console.warn('No se pudo cargar la configuración de la tienda:', error.message);
        }

        if (data) {
            configuracion = data.reduce((acc, curr) => {
                acc[curr.clave] = curr.valor;
                return acc;
            }, {});
        }

        const heroSection = document.getElementById('heroSection');
        if (configuracion.hero_image_url) {
            heroSection.style.backgroundImage = `url('${configuracion.hero_image_url}')`;
        } else {
            heroSection.style.background = 'linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%)';
        }
    } catch (error) {
        console.error('Ocurrió un error inesperado al procesar la configuración de la tienda:', (error as Error).message || error);
    }
}

async function cargarCategorias() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('categorias').select('*').order('nombre');
        if (error) {
            console.warn("Advertencia al cargar categorías:", error.message);
            categorias = [];
        } else {
            categorias = data || [];
        }
    } catch (error) {
        console.error("Error inesperado al cargar categorías:", (error as Error).message);
        categorias = [];
    } finally {
        renderizarFiltrosCategorias();
        llenarSelectorCategoriasProducto();
    }
}

async function verificarSesion() {
    if (!supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        usuarioActual = session.user;
        mostrarPanelAdmin();
    }
}

async function iniciarSesion(event) {
    event.preventDefault();
    // FIX: Cast HTML elements to access their properties
    const email = (document.getElementById('emailLogin') as HTMLInputElement).value;
    const password = (document.getElementById('passwordLogin') as HTMLInputElement).value;
    const errorDiv = document.getElementById('loginError');
    errorDiv.style.display = 'none';
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        usuarioActual = data.user;
        mostrarPanelAdmin();
    } catch (error) {
        errorDiv.style.display = 'block';
        errorDiv.textContent = 'Error al iniciar sesion: ' + (error as Error).message;
    }
}
window.iniciarSesion = iniciarSesion;

function mostrarPanelAdmin() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('adminEmail').textContent = usuarioActual.email;
    
    cargarPedidos();
    cargarProductosAdmin();
    cargarCategoriasAdmin();
    cargarConfiguracionAdmin();
    cargarInventario();
    inicializarReportes();

    mostrarVistaAdmin('pedidos');
    suscribirACambiosPedidos();
}

function mostrarVistaAdmin(vista, subVista = null) {
    // FIX: Cast element to HTMLElement to access style property
    document.querySelectorAll('.admin-view-content').forEach(v => ((v as HTMLElement).style.display = 'none'));
    document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));

    const vistaPrincipal = vista.startsWith('movimientos') ? 'inventario' : vista;
    
    document.getElementById(`${vistaPrincipal}View`).style.display = 'block';
    document.getElementById(`navBtn${vistaPrincipal.charAt(0).toUpperCase() + vistaPrincipal.slice(1)}`).classList.add('active');

    if (vista === 'inventario') {
        document.getElementById('inventarioDashboard').style.display = 'block';
        document.getElementById('movimientosView').style.display = 'none';
    } else if (vista === 'movimientos') {
        document.getElementById('inventarioDashboard').style.display = 'none';
        document.getElementById('movimientosView').style.display = 'block';
    }
}
window.mostrarVistaAdmin = mostrarVistaAdmin;

function navegarAProductos() {
    limpiarFiltroProductos();
    mostrarVistaAdmin('productos');
}
window.navegarAProductos = navegarAProductos;

function cargarConfiguracionAdmin() {
    // FIX: Cast HTML element to access its properties
    const heroInput = document.getElementById('heroImageUrl') as HTMLInputElement;
    if (heroInput) heroInput.value = configuracion.hero_image_url || '';

    const form = document.getElementById('configForm') as HTMLFormElement;
    const saveBtn = document.getElementById('btnGuardarConfig') as HTMLButtonElement;
    saveBtn.disabled = true;
    saveBtn.title = 'No hay cambios para guardar';
    form.oninput = () => {
        saveBtn.disabled = false;
        saveBtn.title = 'Guardar Cambios';
    };
}

async function guardarConfiguracion(event) {
    event.preventDefault();
    // FIX: Cast HTML element to access its properties
    const btn = document.getElementById('btnGuardarConfig') as HTMLButtonElement;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    // FIX: Cast HTML element to access its properties
    const heroImageUrl = (document.getElementById('heroImageUrl') as HTMLInputElement).value;

    try {
        const { error } = await supabaseClient
            .from('configuracion')
            .upsert({ clave: 'hero_image_url', valor: heroImageUrl }, { onConflict: 'clave' });
        if (error) throw error;
        
        mostrarNotificacion('Configuración guardada exitosamente.');
        await cargarConfiguracion();
        btn.title = 'No hay cambios para guardar';
    } catch (error) {
        alert('Error al guardar: ' + (error as Error).message);
        btn.disabled = false;
    } finally {
        btn.textContent = originalText;
    }
}
window.guardarConfiguracion = guardarConfiguracion;

async function cerrarSesion() {
    if (pedidosChannel) {
        supabaseClient.removeChannel(pedidosChannel);
        pedidosChannel = null;
    }
    await supabaseClient.auth.signOut();
    usuarioActual = null;
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
    mostrarTienda();
}
window.cerrarSesion = cerrarSesion;

function mostrarTienda() {
    document.getElementById('tiendaView').style.display = 'block';
    document.getElementById('adminView').style.display = 'none';
}
window.mostrarTienda = mostrarTienda;

function mostrarAdmin() {
    document.getElementById('tiendaView').style.display = 'none';
    document.getElementById('adminView').style.display = 'block';
    if (usuarioActual) mostrarPanelAdmin();
    else {
        document.getElementById('loginSection').style.display = 'block';
        document.getElementById('adminPanel').style.display = 'none';
    }
}
window.mostrarAdmin = mostrarAdmin;

async function cargarProductos() {
    if (!supabaseClient) return;
    document.getElementById('loadingProducts').style.display = 'block';
    document.getElementById('productsGrid').innerHTML = '';
    try {
        const { data, error } = await supabaseClient
            .from('productos')
            .select('*, categorias(nombre, slug)')
            .eq('activo', true)
            .order('nombre');

        if (error) throw error;
        
        productos = data || [];
        
        if (productos.length === 0) {
            document.getElementById('productsGrid').innerHTML = 
                '<div class="empty-cart"><p>No hay productos disponibles. Ve al panel Admin para agregar productos.</p></div>';
            return;
        }
        
        renderizarProductos();

    } catch (error) {
        document.getElementById('productsGrid').innerHTML = 
            `<div class="empty-cart"><p>Error al cargar productos: ${(error as Error).message}</p><p style="font-size: 0.8rem; color: #999;">Asegúrate de haber ejecutado el script de configuración desde la pestaña de Ayuda en el panel Admin.</p></div>`;
        productos = [];
    } finally {
        document.getElementById('loadingProducts').style.display = 'none';
    }
}

function renderizarFiltrosCategorias() {
    const filterContainer = document.getElementById('categoryFilter');
    filterContainer.innerHTML = `
        <button class="filter-btn ${'todos' === categoriaActual ? 'active' : ''}" onclick="filtrarCategoria('todos')">
            Todos
        </button>
        ${categorias.map(cat => `
            <button class="filter-btn ${cat.slug === categoriaActual ? 'active' : ''}" 
                            onclick="filtrarCategoria('${cat.slug}')">
                ${cat.nombre}
            </button>
        `).join('')}`;
}

function filtrarCategoria(slug) {
    categoriaActual = slug;
    renderizarFiltrosCategorias();
    renderizarProductos();
}
window.filtrarCategoria = filtrarCategoria;

function renderizarProductos() {
    const grid = document.getElementById('productsGrid');
    const productosFiltrados = categoriaActual === 'todos' 
        ? productos 
        : productos.filter(p => p.categorias && p.categorias.slug === categoriaActual);
    
    if (productosFiltrados.length === 0) {
        grid.innerHTML = '<div class="empty-cart"><p>No hay productos en esta categoria.</p></div>';
        return;
    }

    grid.innerHTML = productosFiltrados.map(producto => {
        const hasVariants = producto.variantes && Array.isArray(producto.variantes) && producto.variantes.length > 0;
        
        let imagenPrincipal = producto.imagen_url;
        if (hasVariants) {
            const primeraOpcionConImagen = producto.variantes
                .flatMap(v => v.opciones || [])
                .find(o => o.imagen_url);
            if (primeraOpcionConImagen) {
                imagenPrincipal = primeraOpcionConImagen.imagen_url;
            }
        }
        
        let variantesHTML = '';
        if (hasVariants) {
            const colorVariant = producto.variantes.find(v => v.nombre.toLowerCase() === 'color');
            if (colorVariant && colorVariant.opciones) {
                variantesHTML = `<div class="variant-swatches">
                    ${colorVariant.opciones.map(opcion => {
                        const colorValue = opcion.valor.toLowerCase();
                        const cssColor = colorMap[colorValue] || '#e5e7eb'; // Default color
                        return `<div class="color-swatch" style="background-color: ${cssColor};" title="${opcion.valor}"></div>`;
                    }).join('')}
                </div>`;
            }
        }


        return `
        <div class="product-card">
            <div class="product-image">
                ${imagenPrincipal 
                    ? `<img src="${optimizarImagenUrl(imagenPrincipal)}" alt="${producto.nombre}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
                       <span style="display:none">${producto.icon || '📦'}</span>`
                    : `<span>${producto.icon || '📦'}</span>`
                }
                ${producto.badge ? `<span class="product-badge">${producto.badge}</span>` : ''}
                ${producto.stock <= 0 ? `<span class="product-badge" style="background: var(--text-dark); left: 15px; right: auto;">Agotado</span>` : ''}
            </div>
            <div class="product-info">
                <div class="product-category">${producto.categorias ? producto.categorias.nombre : 'Sin Categoría'}</div>
                <h3 class="product-name">${producto.nombre}</h3>
                <div class="product-brand">${producto.marca}</div>
                <p class="product-description">${producto.descripcion}</p>
                <div style="margin-top: auto; padding-top: 1rem;">
                    ${variantesHTML}
                    ${producto.stock > 0 && producto.stock <= 10 ? `<div class="product-stock">¡Solo quedan ${producto.stock} en stock!</div>` : ''}
                    <div class="product-price">S/ ${parseFloat(producto.precio).toFixed(2)}</div>
                </div>
                ${producto.stock > 0 ?
                    (hasVariants 
                        ? `<button class="add-to-cart-btn" onclick="abrirModalDetalleProducto(${producto.id})">Ver Opciones</button>`
                        : `<button class="add-to-cart-btn" onclick="agregarAlCarrito(${producto.id})">Agregar al Carrito</button>`
                    )
                    : `<button class="add-to-cart-btn" disabled style="background: var(--text-light); cursor: not-allowed;">Agotado</button>`
                }
            </div>
        </div>
    `}).join('');
}

// --- Product Detail Modal ---
function abrirModalDetalleProducto(id) {
    productoSeleccionado = productos.find(p => p.id === id);
    if (!productoSeleccionado) return;

    let imagenInicial = productoSeleccionado.imagen_url;
    if (productoSeleccionado.variantes && productoSeleccionado.variantes.length > 0) {
        const primeraOpcionConImagen = productoSeleccionado.variantes
            .flatMap(v => v.opciones || [])
            .find(o => o.imagen_url);
        if (primeraOpcionConImagen) {
            imagenInicial = primeraOpcionConImagen.imagen_url;
        }
    }

    document.getElementById('detalleProductoImagen').innerHTML = imagenInicial
        ? `<img src="${optimizarImagenUrl(imagenInicial, 800)}" alt="${productoSeleccionado.nombre}">`
        : `<span style="font-size: 8rem;">${productoSeleccionado.icon || '📦'}</span>`;

    document.getElementById('detalleProductoNombre').textContent = productoSeleccionado.nombre;
    document.getElementById('detalleProductoMarca').textContent = productoSeleccionado.marca;
    document.getElementById('detalleProductoDescripcion').textContent = productoSeleccionado.descripcion;
    document.getElementById('detalleProductoPrecio').textContent = `S/ ${parseFloat(productoSeleccionado.precio).toFixed(2)}`;

    const variantesContainer = document.getElementById('detalleProductoVariantes');
    variantesContainer.innerHTML = (productoSeleccionado.variantes || []).map(variante => `
        <div class="form-group">
            <label>${variante.nombre}</label>
            <select class="variante-select" data-variante-nombre="${variante.nombre}">
                <option value="">Seleccionar ${variante.nombre}</option>
                ${(variante.opciones || []).map(opcion => `<option value="${opcion.valor}">${opcion.valor}</option>`).join('')}
            </select>
        </div>
    `).join('');
    
     document.querySelectorAll('#detalleProductoVariantes .variante-select').forEach(select => {
        select.addEventListener('change', () => {
            // FIX: Cast element to access its properties
            const sel = select as HTMLSelectElement;
            const varianteNombre = sel.dataset.varianteNombre;
            const opcionValor = sel.value;

            const variante = productoSeleccionado.variantes.find(v => v.nombre === varianteNombre);
            if (variante) {
                const opcion = (variante.opciones || []).find(o => o.valor === opcionValor);
                if (opcion && opcion.imagen_url) {
                    const imgContainer = document.getElementById('detalleProductoImagen');
                    imgContainer.innerHTML = `<img src="${optimizarImagenUrl(opcion.imagen_url, 800)}" alt="${productoSeleccionado.nombre}">`;
                }
            }
        });
    });

    document.getElementById('detalleProductoModal').classList.add('show');
}
window.abrirModalDetalleProducto = abrirModalDetalleProducto;

function cerrarModalDetalleProducto() {
    document.getElementById('detalleProductoModal').classList.remove('show');
    productoSeleccionado = null;
}
window.cerrarModalDetalleProducto = cerrarModalDetalleProducto;

function agregarAlCarritoDesdeModal() {
    const variantesSeleccionadas = {};
    const selects = document.querySelectorAll('#detalleProductoVariantes .variante-select');
    let allSelected = true;

    selects.forEach(select => {
        // FIX: Cast element to access its properties
        const label = (select.previousElementSibling as HTMLElement).textContent;
        const s = select as HTMLSelectElement;
        if (s.value) {
            variantesSeleccionadas[label] = s.value;
        } else {
            allSelected = false;
        }
    });

    if (!allSelected) {
        mostrarNotificacion('⚠️ Por favor, selecciona una opción para cada variante.');
        return;
    }

    agregarAlCarrito(productoSeleccionado.id, variantesSeleccionadas);
    cerrarModalDetalleProducto();
}
window.agregarAlCarritoDesdeModal = agregarAlCarritoDesdeModal;


// --- Cart Logic ---
function generarCartId(productoId, variantes) {
    if (!variantes) return productoId.toString();
    const variantString = Object.entries(variantes)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => `${key}:${value}`)
        .join('|');
    return `${productoId}-${variantString}`;
}

function agregarAlCarrito(productoId, variantesSeleccionadas = null) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    const cartId = generarCartId(productoId, variantesSeleccionadas);
    const itemExistente = carrito.find(item => item.cartId === cartId);
    const cantidadEnCarrito = itemExistente ? itemExistente.cantidad : 0;

    if (cantidadEnCarrito + 1 > producto.stock) {
        mostrarNotificacion(`⚠️ Stock insuficiente. Solo quedan ${producto.stock} unidades.`);
        return;
    }

    if (itemExistente) {
        itemExistente.cantidad++;
    } else {
        carrito.push({
            ...producto,
            cantidad: 1,
            variantes_seleccionadas: variantesSeleccionadas,
            cartId: cartId
        });
    }
    actualizarContadorCarrito();
    mostrarNotificacion('✅ Producto agregado al carrito');
}
window.agregarAlCarrito = agregarAlCarrito;

function actualizarContadorCarrito() {
    document.getElementById('cartCount').textContent = carrito.reduce((sum, item) => sum + item.cantidad, 0).toString();
}

function abrirCarrito() {
    document.getElementById('cartModal').classList.add('show');
    renderizarCarrito();
}
window.abrirCarrito = abrirCarrito;

function cerrarCarrito() {
    document.getElementById('cartModal').classList.remove('show');
}
window.cerrarCarrito = cerrarCarrito;

function renderizarCarrito() {
    const content = document.getElementById('cartContent');
    document.getElementById('successMessage').style.display = 'none';
    if (carrito.length === 0) {
        content.innerHTML = `<div class="empty-cart"><div class="empty-cart-icon">🛒</div><p>Tu carrito esta vacio</p></div>`;
        return;
    }
    const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    content.innerHTML = `
        ${carrito.map(item => `
            <div class="cart-item">
                <div class="cart-item-icon">${item.icon || '📦'}</div>
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.nombre}</div>
                     ${item.variantes_seleccionadas ? `<div class="cart-item-variants">${Object.entries(item.variantes_seleccionadas).map(([k, v]) => `${k}: ${v}`).join(', ')}</div>` : ''}
                    <div class="cart-item-brand">${item.marca}</div>
                    <div class="cart-item-price">S/ ${parseFloat(item.precio).toFixed(2)} c/u</div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" onclick="cambiarCantidad('${item.cartId}', -1)">-</button>
                        <span class="qty-display">${item.cantidad}</span>
                        <button class="qty-btn" onclick="cambiarCantidad('${item.cartId}', 1)">+</button>
                        <button class="remove-btn" onclick="eliminarItem('${item.cartId}')">Eliminar</button>
                    </div>
                </div>
                <div style="font-weight: 700; font-size: 1.2rem; color: var(--primary);">
                    S/ ${(item.precio * item.cantidad).toFixed(2)}
                </div>
            </div>
        `).join('')}
        <div class="cart-total">
            <span class="cart-total-label">Total:</span>
            <span class="cart-total-amount">S/ ${total.toFixed(2)}</span>
        </div>
        <form class="checkout-form" id="checkoutForm">
            <div class="form-group"><label>Nombre Completo</label><input type="text" id="nombreCliente" required></div>
            <div class="form-group"><label>Telefono (sin prefijo +51)</label><input type="tel" id="telefonoCliente" required placeholder="905820448"></div>
            <div class="form-group"><label>Email (Opcional)</label><input type="email" id="emailCliente" placeholder="cliente@ejemplo.com"></div>
            <div class="form-group">
                <label>Direccion de Entrega</label>
                <textarea id="direccionCliente" required></textarea>
            </div>
            <button type="submit" class="btn-primary" id="btnRealizarPedido">Realizar Pedido</button>
        </form>`;
}

function cambiarCantidad(cartId, cambio) {
    const itemIndex = carrito.findIndex(item => item.cartId === cartId);
    if (itemIndex === -1) return;

    const item = carrito[itemIndex];
    const producto = productos.find(p => p.id === item.id);

    if (cambio > 0 && producto && (item.cantidad + cambio > producto.stock)) {
        mostrarNotificacion(`⚠️ Stock insuficiente. Solo quedan ${producto.stock} unidades.`);
        return;
    }

    item.cantidad += cambio;
    if (item.cantidad <= 0) {
        carrito.splice(itemIndex, 1);
    }
    
    actualizarContadorCarrito();
    renderizarCarrito();
}
window.cambiarCantidad = cambiarCantidad;

function eliminarItem(cartId) {
    carrito = carrito.filter(item => item.cartId !== cartId);
    actualizarContadorCarrito();
    renderizarCarrito();
}
window.eliminarItem = eliminarItem;

async function realizarPedido() {
    if (isProcessingOrder) {
        console.warn("Pedido ya en proceso. Intento duplicado bloqueado.");
        return;
    }

    const btnPedido = document.getElementById('btnRealizarPedido') as HTMLButtonElement;
    const cartParaPedido = [...carrito];

    try {
        isProcessingOrder = true;
        if (btnPedido) {
            btnPedido.disabled = true;
            btnPedido.textContent = 'Procesando pedido...';
        }

        if (cartParaPedido.length === 0) {
            mostrarNotificacion('⚠️ Tu carrito está vacío.');
            // We need to release the lock if we return early.
            // No need to manually re-enable button, finally block handles the lock
            return;
        }

        const nombre = (document.getElementById('nombreCliente') as HTMLInputElement).value;
        const telefono = (document.getElementById('telefonoCliente') as HTMLInputElement).value;
        const email = (document.getElementById('emailCliente') as HTMLInputElement).value || null;
        const direccion = (document.getElementById('direccionCliente') as HTMLTextAreaElement).value;

        // Empty the main cart immediately
        carrito = [];
        actualizarContadorCarrito();
        
        const total = cartParaPedido.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
        const cantidad = cartParaPedido.reduce((sum, item) => sum + item.cantidad, 0);

        const productosParaPedido = cartParaPedido.map(item => {
            const productoOriginal = productos.find(p => p.id === item.id);
            const costoUnitario = productoOriginal ? (productoOriginal.precio_costo || 0) : 0;
            return {
                id: item.id,
                producto: item.nombre,
                marca: item.marca,
                cantidad: item.cantidad,
                precio_unitario: parseFloat(item.precio),
                costo_unitario: costoUnitario,
                subtotal: parseFloat(item.precio) * item.cantidad,
                variantes: item.variantes_seleccionadas
            };
        });

        const { data: pedidoGuardado, error } = await supabaseClient
            .rpc('crear_pedido', {
                nombre_c: nombre,
                telefono_c: telefono,
                email_c: email,
                direccion_c: direccion,
                productos_c: productosParaPedido,
                total_c: total,
                cantidad_c: cantidad
            });

        if (error) throw error;
        
        try {
            await fetch('https://webhook.red51.site/webhook/pedidos_red51', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pedidoGuardado)
            });
        } catch (webhookError) {
            console.warn('El pedido se guardó, pero falló el envío al webhook:', (webhookError as Error).message);
        }

        document.getElementById('cartContent').style.display = 'none';
        document.getElementById('successMessage').style.display = 'block';

    } catch (error) {
        // Restore cart on failure
        carrito = cartParaPedido;
        actualizarContadorCarrito();
        renderizarCarrito(); // Re-render cart with items and active button
        alert('Error al realizar el pedido: ' + (error as Error).message);
    } finally {
        isProcessingOrder = false;
    }
}
window.realizarPedido = realizarPedido;

function cerrarYLimpiar() {
    cerrarCarrito();
    const cartContent = document.getElementById('cartContent');
    cartContent.style.display = 'block';
    document.getElementById('successMessage').style.display = 'none';
    renderizarCarrito();
}
window.cerrarYLimpiar = cerrarYLimpiar;

// --- ADMIN: Pedidos ---
async function cargarPedidos() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('pedidos')
            .select('*')
            .order('fecha_pedido', { ascending: false });
        
        if (error) throw error;
        pedidos = data || [];
        renderizarFiltroEstados();
        renderizarPedidos();
    } catch (error) {
        console.error("Error al cargar pedidos:", (error as Error).message);
    }
}

function renderizarFiltroEstados() {
    const container = document.getElementById('pedidosFilterContainer');
    const estados = ['todos', ...estadosPosibles];
    container.innerHTML = estados.map(e => `
        <button class="filter-btn ${e === estadoPedidoActual ? 'active' : ''}" onclick="filtrarPedidosPorEstado('${e}')">
            ${(e.charAt(0).toUpperCase() + e.slice(1)).replace(/_/g, ' ')}
        </button>
    `).join('');
}

function filtrarPedidosPorEstado(estado) {
    estadoPedidoActual = estado;
    renderizarFiltroEstados();
    renderizarPedidos();
}
window.filtrarPedidosPorEstado = filtrarPedidosPorEstado;

function renderizarPedidos() {
    const pedidosFiltrados = estadoPedidoActual === 'todos'
        ? pedidos
        : pedidos.filter(p => p.estado === estadoPedidoActual);

    const ingresosTotales = pedidosFiltrados.reduce((sum, p) => sum + parseFloat(p.total), 0);
    const pedidosPendientes = pedidos.filter(p => p.estado === 'pendiente_pago' || p.estado === 'pago_confirmado' || p.estado === 'en_preparacion').length;
    
    document.getElementById('kpiIngresos').textContent = `S/ ${ingresosTotales.toFixed(2)}`;
    document.getElementById('kpiTotalPedidos').textContent = pedidos.length.toString();
    document.getElementById('kpiPendientes').textContent = pedidosPendientes.toString();
    const bajosStock = (inventario || []).filter(p => p.stock > 0 && p.stock <= 5).length;
    document.getElementById('kpiBajosStockPedidos').querySelector('.kpi-card-value').textContent = bajosStock.toString();

    const tbody = document.getElementById('adminPedidosTable');
    if(pedidosFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">No hay pedidos con este estado.</td></tr>`;
        return;
    }
    tbody.innerHTML = pedidosFiltrados.map(p => `
        <tr data-id="${p.id}" onclick="verDetallesPedido('${p.id}')">
            <td>${p.numero_pedido || 'N/A'}</td>
            <td>${new Date(p.fecha_pedido).toLocaleDateString()}</td>
            <td>${p.nombre_cliente}</td>
            <td>S/ ${parseFloat(p.total).toFixed(2)}</td>
            <td onclick="event.stopPropagation()">
                 <select class="status-select ${p.estado}" onchange="cambiarEstadoPedido('${p.id}', this.value)">
                    ${estadosPosibles.map(e => `<option value="${e}" ${e === p.estado ? 'selected' : ''}>${e.replace(/_/g, ' ')}</option>`).join('')}
                </select>
            </td>
        </tr>
    `).join('');
}

async function verDetallesPedido(pedidoId) {
    try {
        const pedido = pedidos.find(p => p.id == pedidoId);
        if (!pedido) throw new Error('Pedido no encontrado');
        
        const modalBody = document.getElementById('pedidoModalBody');

        modalBody.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; flex-wrap: wrap;">
                <div>
                    <h4>Datos del Cliente</h4>
                    <p><strong>Nombre:</strong> ${pedido.nombre_cliente}</p>
                    <p><strong>Teléfono:</strong> ${pedido.telefono_cliente}</p>
                    <p><strong>Email:</strong> ${pedido.email_cliente || 'No provisto'}</p>
                    <p><strong>Dirección:</strong> ${pedido.direccion}</p>
                </div>
                <div>
                    <h4>Resumen del Pedido</h4>
                    <p><strong>N° Pedido:</strong> ${pedido.numero_pedido || 'N/A'}</p>
                    <p><strong>Fecha:</strong> ${new Date(pedido.fecha_pedido).toLocaleString()}</p>
                    <p><strong>Total:</strong> S/ ${parseFloat(pedido.total).toFixed(2)}</p>
                    <div class="form-group" style="margin-top: 1rem;">
                        <label style="color: var(--text-dark);">Cambiar Estado</label>
                        <select id="modalStatusSelect" class="status-select ${pedido.estado}" onchange="cambiarEstadoPedido('${pedido.id}', this.value)">
                            ${estadosPosibles.map(e => `<option value="${e}" ${e === pedido.estado ? 'selected' : ''}>${e.replace(/_/g, ' ')}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
            <h4 style="margin-top: 2rem; margin-bottom: 1rem;">Productos</h4>
            ${(pedido.productos || []).map(p => {
                const variantesStr = p.variantes ? ` <span class="cart-item-variants">${Object.entries(p.variantes).map(([k, v]) => `${k}: ${v}`).join(', ')}</span>` : '';
                return `
                <div class="cart-item" style="padding: 1rem;">
                   <div class="cart-item-info">
                        <div class="cart-item-name">${p.producto} (x${p.cantidad})</div>
                        <div class="cart-item-brand">${p.marca}</div>
                        ${variantesStr}
                   </div>
                   <div style="font-weight: 700; font-size: 1.1rem; color: var(--primary);">
                        S/ ${parseFloat(p.subtotal).toFixed(2)}
                   </div>
                </div>
            `}).join('')}
        `;
        document.getElementById('pedidoModal').classList.add('show');
        
        // Ensure the select inside the modal is correctly updated
         const modalSelect = document.getElementById('modalStatusSelect') as HTMLSelectElement;
         if (modalSelect) modalSelect.value = pedido.estado;


    } catch (error) {
        alert("Error al cargar detalles del pedido: " + (error as Error).message);
    }
}
window.verDetallesPedido = verDetallesPedido;

function cerrarModalPedido() {
     document.getElementById('pedidoModal').classList.remove('show');
}
window.cerrarModalPedido = cerrarModalPedido;

async function cambiarEstadoPedido(pedidoId, nuevoEstado) {
    try {
        if (['pago_confirmado', 'en_preparacion'].includes(nuevoEstado)) {
            const { error: rpcError } = await supabaseClient.rpc('descontar_stock_pedido', { id_pedido: pedidoId });
            if (rpcError) {
                 throw new Error(`No se pudo procesar. ${rpcError.message}`);
            }
            mostrarNotificacion('📦 Stock descontado exitosamente con estrategia FEFO.');
        }
        
        const { error } = await supabaseClient
            .from('pedidos')
            .update({ estado: nuevoEstado })
            .eq('id', pedidoId);
        if (error) throw error;
        
        mostrarNotificacion(`✅ Estado del pedido actualizado a: ${nuevoEstado.replace('_', ' ')}`);

        const pedidoIndex = pedidos.findIndex(p => p.id == pedidoId);
        if (pedidoIndex !== -1) {
            pedidos[pedidoIndex].estado = nuevoEstado;
            if (['pago_confirmado', 'en_preparacion'].includes(nuevoEstado)) {
                pedidos[pedidoIndex].stock_descontado = true;
            }
        }
        renderizarPedidos();
        
        await cargarProductosAdmin();
        await cargarProductos();
        await cargarInventario();

        const modalSelect = document.getElementById('modalStatusSelect') as HTMLSelectElement;
        if (modalSelect) {
            modalSelect.className = `status-select ${nuevoEstado}`;
            modalSelect.value = nuevoEstado;
        }

    } catch(error) {
        alert("Error al actualizar el estado: " + (error as Error).message);
        await cargarPedidos(); // Recargar para revertir la UI a su estado real
    }
}
window.cambiarEstadoPedido = cambiarEstadoPedido;

function suscribirACambiosPedidos() {
    if (pedidosChannel) {
        supabaseClient.removeChannel(pedidosChannel);
    }
    pedidosChannel = supabaseClient
        .channel('pedidos-db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'pedidos' },
            (payload) => {
                console.log('Cambio recibido en pedidos!', payload);
                const changedRecord = payload.new;
                const index = pedidos.findIndex(p => p.id === changedRecord.id);

                if (payload.eventType === 'DELETE') {
                   if(index !== -1) pedidos.splice(index, 1);
                } else if (index !== -1) {
                    pedidos[index] = { ...pedidos[index], ...changedRecord };
                } else {
                    pedidos.unshift(changedRecord); // Add new orders to the top
                }
                
                renderizarPedidos();
                
                setTimeout(() => {
                    const updatedRow = document.querySelector(`tr[data-id="${changedRecord.id}"]`);
                    if (updatedRow && payload.eventType !== 'DELETE') {
                        updatedRow.classList.add('row-updated');
                        setTimeout(() => updatedRow.classList.remove('row-updated'), 3000);
                    }
                }, 0);
            }
        )
        .subscribe();
}

// --- ADMIN: Productos y Categorías ---
async function cargarProductosAdmin() {
    if (!supabaseClient) return;
    document.getElementById('loadingAdmin').style.display = 'block';
    try {
        const { data, error } = await supabaseClient.from('productos').select('*, categorias(nombre)').order('nombre');
        if (error) throw error;
        
        productosAdmin = (data || []).map(p => ({
            ...p,
            categorias: p.categorias ? { nombre: p.categorias.nombre } : null
        }));

        renderizarProductosAdmin();
    } catch (error) {
        alert('Error al cargar productos: ' + (error as Error).message);
    } finally {
        document.getElementById('loadingAdmin').style.display = 'none';
    }
}

function renderizarProductosAdmin() {
    const tbody = document.getElementById('adminProductsTable');
    // FIX: Cast HTML element to access its properties
    const searchTerm = (document.getElementById('productSearchInput') as HTMLInputElement).value.toLowerCase();
    const clearBtn = document.getElementById('clearProductFilterBtn');
    const filterTitle = document.getElementById('productFilterTitle');

    let productosFiltrados = productosAdmin;

    if (isLowStockFilterActive) {
        productosFiltrados = productosFiltrados.filter(p => p.stock > 0 && p.stock <= 5);
        filterTitle.textContent = 'Mostrando productos con bajo stock (5 o menos unidades)';
        filterTitle.style.display = 'block';
    } else {
         filterTitle.style.display = 'none';
    }
    
    if (searchTerm) {
        productosFiltrados = productosFiltrados.filter(p => 
            p.nombre.toLowerCase().includes(searchTerm) || 
            (p.marca && p.marca.toLowerCase().includes(searchTerm))
        );
    }
    
    if (isLowStockFilterActive || searchTerm) {
        clearBtn.style.display = 'inline-block';
    } else {
        clearBtn.style.display = 'none';
    }
    
    if (productosFiltrados.length === 0) {
         tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem;">No se encontraron productos con los filtros actuales.</td></tr>`;
         return;
    }

    tbody.innerHTML = productosFiltrados.map(p => {
        let imagenPrincipal = p.imagen_url;
        if (p.variantes && p.variantes.length > 0) {
            const primeraOpcionConImagen = p.variantes.flatMap(v => v.opciones || []).find(o => o.imagen_url);
            if (primeraOpcionConImagen) imagenPrincipal = primeraOpcionConImagen.imagen_url;
        }

        return `
        <tr style="cursor: default;">
            <td>${imagenPrincipal ? `<img src="${optimizarImagenUrl(imagenPrincipal, 50)}" alt="${p.nombre}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;" onerror="this.style.display='none'">` : '<span style="font-size: 0.8rem; color: #999;">Sin imagen</span>'}</td>
            <td>${p.nombre}</td>
            <td>${p.categorias ? p.categorias.nombre : 'Sin categoría'}</td>
            <td>S/ ${parseFloat(p.precio).toFixed(2)}</td>
            <td>${p.variantes && p.variantes.length > 0 ? `${p.variantes.length} tipo(s)` : 'No'}</td>
            <td>${p.activo ? 'Activo' : 'Inactivo'}</td>
            <td class="table-actions">
                <button class="btn-edit" onclick="editarProducto(${p.id}, event)">Editar</button>
                <button class="btn-danger" onclick="eliminarProducto(${p.id}, event)">Eliminar</button>
            </td>
        </tr>`
    }).join('');
}

function verProductosBajosStock() {
    isLowStockFilterActive = true;
    mostrarVistaAdmin('productos');
    renderizarProductosAdmin();
}
window.verProductosBajosStock = verProductosBajosStock;

function limpiarFiltroProductos() {
    // FIX: Cast HTML element to access its properties
    (document.getElementById('productSearchInput') as HTMLInputElement).value = '';
    isLowStockFilterActive = false;
    renderizarProductosAdmin();
}
window.limpiarFiltroProductos = limpiarFiltroProductos;

async function cargarCategoriasAdmin() {
    if(!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('categorias').select('*').order('nombre');
        if (error) throw error;
        const tbody = document.getElementById('adminCategoriesTable');
        tbody.innerHTML = (data || []).map(cat => `
            <tr style="cursor: default;">
                <td>${cat.nombre}</td>
                <td>${cat.slug}</td>
                <td class="table-actions">
                    <button class="btn-edit" onclick="editarCategoria(${cat.id}, event)">Editar</button>
                    <button class="btn-danger" onclick="eliminarCategoria(${cat.id}, event)">Eliminar</button>
                </td>
            </tr>`).join('');
    } catch (error) {
        alert('Error al cargar categorías: ' + (error as Error).message);
    }
}

function abrirModalCategoria() {
    document.getElementById('categoriaModalTitle').textContent = 'Agregar Categoría';
    // FIX: Cast HTML element to access its properties
    const form = document.getElementById('categoriaForm') as HTMLFormElement;
    form.reset();
    (document.getElementById('categoriaId') as HTMLInputElement).value = '';
    
    const saveBtn = document.getElementById('btnGuardarCategoria') as HTMLButtonElement;
    saveBtn.disabled = true;
    saveBtn.title = 'No hay cambios para guardar';
    form.oninput = () => {
        saveBtn.disabled = false;
        saveBtn.title = '';
    };
    
    document.getElementById('categoriaModal').classList.add('show');
}
window.abrirModalCategoria = abrirModalCategoria;

function cerrarModalCategoria() {
    document.getElementById('categoriaModal').classList.remove('show');
}
window.cerrarModalCategoria = cerrarModalCategoria;

async function editarCategoria(id, event) {
    event.stopPropagation();
    try {
        const { data, error } = await supabaseClient.from('categorias').select('*').eq('id', id).single();
        if (error) throw error;
        document.getElementById('categoriaModalTitle').textContent = 'Editar Categoría';
        // FIX: Cast HTML elements to access their properties
        (document.getElementById('categoriaId') as HTMLInputElement).value = data.id;
        (document.getElementById('categoriaNombre') as HTMLInputElement).value = data.nombre;
        (document.getElementById('categoriaSlug') as HTMLInputElement).value = data.slug;
        
        const form = document.getElementById('categoriaForm') as HTMLFormElement;
        const saveBtn = document.getElementById('btnGuardarCategoria') as HTMLButtonElement;
        saveBtn.disabled = true;
        saveBtn.title = 'No hay cambios para guardar';
        form.oninput = () => {
            saveBtn.disabled = false;
            saveBtn.title = '';
        };
        
        document.getElementById('categoriaModal').classList.add('show');
    } catch (error) {
        alert('Error al cargar categoría: ' + (error as Error).message);
    }
}
window.editarCategoria = editarCategoria;

async function guardarCategoria(event) {
    event.preventDefault();
    // FIX: Cast HTML elements to access their properties
    const id = (document.getElementById('categoriaId') as HTMLInputElement).value;
    const categoria = {
        nombre: (document.getElementById('categoriaNombre') as HTMLInputElement).value,
        slug: (document.getElementById('categoriaSlug') as HTMLInputElement).value,
    };

    try {
        if (id) {
            const { error } = await supabaseClient.from('categorias').update(categoria).eq('id', id);
            if (error) throw error;
            mostrarNotificacion('✅ Categoría actualizada');
        } else {
            const { error } = await supabaseClient.from('categorias').insert([categoria]);
            if (error) throw error;
            mostrarNotificacion('✅ Categoría creada');
        }
        cerrarModalCategoria();
        await cargarCategorias();
        cargarCategoriasAdmin();
    } catch (error) {
        alert('Error al guardar categoría: ' + (error as Error).message);
    }
}
window.guardarCategoria = guardarCategoria;

async function eliminarCategoria(id, event) {
    event.stopPropagation();
    if (!confirm('¿Estás seguro? Eliminar una categoría fallará si todavía hay productos en ella.')) return;
    try {
        const { error } = await supabaseClient.from('categorias').delete().eq('id', id);
        if (error) throw error;
        mostrarNotificacion('🗑️ Categoría eliminada');
        await cargarCategorias();
        cargarCategoriasAdmin();
    } catch (error) {
        alert('Error al eliminar categoría: ' + (error as Error).message);
    }
}
window.eliminarCategoria = eliminarCategoria;

function generarSlug(text) {
    const slug = text.toString().toLowerCase()
        .replace(/\s+/g, '-') 
        .replace(/[^\w\-]+/g, '') 
        .replace(/\-\-+/g, '-') 
        .replace(/^-+/, '') 
        .replace(/-+$/, ''); 
    // FIX: Cast HTML element to access its properties
    (document.getElementById('categoriaSlug') as HTMLInputElement).value = slug;
}
window.generarSlug = generarSlug;

function llenarSelectorCategoriasProducto() {
    // FIX: Cast HTML element to access its properties
    const select = document.getElementById('productoCategoria') as HTMLSelectElement;
    if (!select) return;
    if (categorias.length === 0) {
        select.innerHTML = '<option value="">Crea una categoría primero</option>';
    } else {
        select.innerHTML = '<option value="">-- Selecciona --</option>' + categorias.map(cat => `<option value="${cat.id}">${cat.nombre}</option>`).join('');
    }
}

async function abrirModalProducto() {
    document.getElementById('productoModalTitle').textContent = 'Agregar Producto';
    // FIX: Cast HTML elements to access their properties
    const form = document.getElementById('productoForm') as HTMLFormElement;
    form.reset();
    (document.getElementById('productoId') as HTMLInputElement).value = '';
    (document.getElementById('productoActivo') as HTMLInputElement).checked = true;
    (document.getElementById('productoGestionLote') as HTMLInputElement).checked = true;
    document.getElementById('variantesContainer').innerHTML = '';
    (document.getElementById('variantImageFile') as HTMLInputElement).value = '';
    llenarSelectorCategoriasProducto();
    
    const saveBtn = document.getElementById('btnGuardarProducto') as HTMLButtonElement;
    saveBtn.disabled = true;
    saveBtn.title = 'No hay cambios para guardar';
    form.oninput = () => {
        saveBtn.disabled = false;
        saveBtn.title = '';
    };

    document.getElementById('productoModal').classList.add('show');
}
window.abrirModalProducto = abrirModalProducto;

function cerrarModalProducto() {
    document.getElementById('productoModal').classList.remove('show');
}
window.cerrarModalProducto = cerrarModalProducto;

async function editarProducto(id, event) {
    event.stopPropagation();
    try {
        const { data, error } = await supabaseClient.from('productos').select('*').eq('id', id).single();
        if (error) throw error;
        // FIX: Cast HTML elements to access their properties
        const form = document.getElementById('productoForm') as HTMLFormElement;
        
        document.getElementById('productoModalTitle').textContent = 'Editar Producto';
        (document.getElementById('productoId') as HTMLInputElement).value = data.id;
        (document.getElementById('productoNombre') as HTMLInputElement).value = data.nombre;
        (document.getElementById('productoMarca') as HTMLInputElement).value = data.marca;
        (document.getElementById('productoDescripcion') as HTMLInputElement).value = data.descripcion;
        (document.getElementById('productoPrecio') as HTMLInputElement).value = data.precio;
        (document.getElementById('productoCosto') as HTMLInputElement).value = data.precio_costo || 0;
        (document.getElementById('productoIcon') as HTMLInputElement).value = data.icon || '';
        (document.getElementById('productoBadge') as HTMLInputElement).value = data.badge || '';
        (document.getElementById('productoActivo') as HTMLInputElement).checked = data.activo;
        (document.getElementById('productoGestionLote') as HTMLInputElement).checked = data.gestiona_lotes;
        (document.getElementById('productoImagen') as HTMLInputElement).value = data.imagen_url || '';
        
        llenarSelectorCategoriasProducto();
        (document.getElementById('productoCategoria') as HTMLSelectElement).value = data.categoria_id;
        
        renderizarVariantesForm(data.variantes);

        const saveBtn = document.getElementById('btnGuardarProducto') as HTMLButtonElement;
        saveBtn.disabled = true;
        saveBtn.title = 'No hay cambios para guardar';
        form.oninput = () => {
            saveBtn.disabled = false;
            saveBtn.title = '';
        };

        document.getElementById('productoModal').classList.add('show');
    } catch (error) {
        alert('Error al cargar producto: ' + (error as Error).message);
    }
}
window.editarProducto = editarProducto;

function agregarTipoVariante() {
    const container = document.getElementById('variantesContainer');
    const div = document.createElement('div');
    div.className = 'variante-group';
    div.innerHTML = `
        <div class="variante-header">
            <input type="text" placeholder="Nombre de la Variante (ej: Color)" class="variante-nombre form-group" style="margin:0;">
            <button type="button" class="btn-danger" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="opciones-container">
            <input type="text" class="form-group" style="margin:0; width: auto;" placeholder="Añadir opción y presionar Enter" onkeydown="agregarOpcionVariante(event)">
        </div>
    `;
    container.appendChild(div);
}
window.agregarTipoVariante = agregarTipoVariante;

function agregarOpcionVariante(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    // FIX: Cast HTML element to access its properties
    const input = event.target as HTMLInputElement;
    const valor = input.value.trim();
    if (!valor) return;

    const div = document.createElement('div');
    div.className = 'opcion-tag-enhanced';
    div.innerHTML = `
        <div class="opcion-image-preview" data-image-url="" onclick="seleccionarImagenVariante(this)">
            <span>🖼️</span>
        </div>
        <div class="opcion-details">
            <span class="opcion-valor">${valor}</span>
        </div>
        <button type="button" onclick="this.parentElement.remove()">×</button>
    `;

    input.parentElement.insertBefore(div, input);
    input.value = '';
}
window.agregarOpcionVariante = agregarOpcionVariante;

function renderizarVariantesForm(variantes) {
    const container = document.getElementById('variantesContainer');
    container.innerHTML = '';
    if (!variantes || !Array.isArray(variantes)) return;

    variantes.forEach(variante => {
        const div = document.createElement('div');
        div.className = 'variante-group';
        
        let opcionesHTML = (variante.opciones || []).map(opcion => {
            const imageUrl = opcion.imagen_url || '';
            const previewContent = imageUrl 
                ? `<img src="${optimizarImagenUrl(imageUrl, 80)}" alt="${opcion.valor}">`
                : `<span>🖼️</span>`;
            return `
            <div class="opcion-tag-enhanced">
                <div class="opcion-image-preview" data-image-url="${imageUrl}" onclick="seleccionarImagenVariante(this)">
                    ${previewContent}
                </div>
                <div class="opcion-details">
                    <span class="opcion-valor">${opcion.valor}</span>
                </div>
                <button type="button" onclick="this.parentElement.remove()">×</button>
            </div>`;
        }).join('');

        div.innerHTML = `
            <div class="variante-header">
                <input type="text" placeholder="Nombre de la Variante" class="variante-nombre form-group" style="margin:0;" value="${variante.nombre || ''}">
                <button type="button" class="btn-danger" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="opciones-container">
                ${opcionesHTML}
                <input type="text" class="form-group" style="margin:0; width: auto;" placeholder="Añadir opción..." onkeydown="agregarOpcionVariante(event)">
            </div>
        `;
        container.appendChild(div);
    });
}

function serializarVariantes() {
    const container = document.getElementById('variantesContainer');
    const variantes = [];
    container.querySelectorAll('.variante-group').forEach(group => {
        // FIX: Cast element to access its properties
        const nombre = (group.querySelector('.variante-nombre') as HTMLInputElement).value.trim();
        if (!nombre) return;
        const opciones = [];
        group.querySelectorAll('.opcion-tag-enhanced').forEach(tag => {
            const valor = (tag.querySelector('.opcion-valor') as HTMLElement).textContent.trim();
            // FIX: Cast element to access its properties
            const imagen_url = (tag.querySelector('.opcion-image-preview') as HTMLElement).dataset.imageUrl || null;
            if (valor) {
                opciones.push({ valor, imagen_url });
            }
        });

        if (opciones.length > 0) {
            variantes.push({ nombre, opciones });
        }
    });
    return variantes.length > 0 ? variantes : null;
}

async function guardarProducto(event) {
    event.preventDefault();
    // FIX: Cast HTML elements to access their properties
    const id = (document.getElementById('productoId') as HTMLInputElement).value;
    const categoriaIdValue = (document.getElementById('productoCategoria') as HTMLSelectElement).value;

    const producto = {
        nombre: (document.getElementById('productoNombre') as HTMLInputElement).value,
        marca: (document.getElementById('productoMarca') as HTMLInputElement).value,
        categoria_id: categoriaIdValue ? parseInt(categoriaIdValue) : null,
        descripcion: (document.getElementById('productoDescripcion') as HTMLInputElement).value,
        precio: parseFloat((document.getElementById('productoPrecio') as HTMLInputElement).value),
        precio_costo: parseFloat((document.getElementById('productoCosto') as HTMLInputElement).value),
        icon: (document.getElementById('productoIcon') as HTMLInputElement).value || '📦',
        badge: (document.getElementById('productoBadge') as HTMLInputElement).value || null,
        activo: (document.getElementById('productoActivo') as HTMLInputElement).checked,
        gestiona_lotes: (document.getElementById('productoGestionLote') as HTMLInputElement).checked,
        imagen_url: (document.getElementById('productoImagen') as HTMLInputElement).value || null,
        variantes: serializarVariantes(),
    };
    
    try {
        if (id) {
            const { error } = await supabaseClient.from('productos').update(producto).eq('id', id);
            if (error) throw error;
            mostrarNotificacion('✅ Producto actualizado exitosamente');
        } else {
            const { error } = await supabaseClient.from('productos').insert([producto]);
            if (error) throw error;
            mostrarNotificacion('✅ Producto creado exitosamente');
        }
        cerrarModalProducto();
        await cargarProductosAdmin();
        await cargarProductos();
        await cargarInventario();
    } catch (error) {
        let friendlyMessage = 'Error al guardar producto: ' + (error as Error).message;
        const lowerCaseError = (error as Error).message.toLowerCase();

        if (lowerCaseError.includes("column \"precio_costo\" does not exist") || lowerCaseError.includes("could not find the 'precio_costo' column")) {
             friendlyMessage = `¡Error de Sincronización de Base de Datos!\n\nLa columna 'precio_costo' no existe en tu tabla de productos. Esto ocurre porque la aplicación fue actualizada para incluir el cálculo de ganancias, pero tu base de datos aún no ha sido actualizada.\n\n✅ SOLUCIÓN SENCILLA:\n1. Ve a la pestaña "Ayuda" en el panel de administrador.\n2. Busca la sección "Herramientas para Desarrolladores".\n3. Copia el script completo llamado "Script de Sincronización de Base de Datos".\n4. Pégalo y ejecútalo en el "SQL Editor" de tu proyecto en Supabase.\n\nEsto actualizará tu base de datos de forma segura sin borrar datos y solucionará el problema permanentemente.`;
        } else if ((error as Error).message && (error as Error).message.includes('violates not-null constraint') && (error as Error).message.includes('"categoria"')) {
            friendlyMessage += `\n\n[POSIBLE SOLUCIÓN] Este error suele ocurrir si la base de datos es de una versión anterior. Ve a Admin -> Ayuda -> Herramientas para Desarrolladores, copia el script completo y ejecútalo en el "SQL Editor" de tu Supabase para sincronizar la base de datos.`;
        }
        alert(friendlyMessage);
    }
}
window.guardarProducto = guardarProducto;

async function eliminarProducto(id, event) {
    event.stopPropagation();
    if (!confirm('¿Estás seguro de eliminar este producto? Esta acción también eliminará todos sus lotes de inventario y movimientos asociados.')) return;
    try {
        const { error } = await supabaseClient.from('productos').delete().eq('id', id);
        if (error) throw error;
        mostrarNotificacion('🗑️ Producto eliminado exitosamente');
        await cargarProductosAdmin();
        await cargarProductos();
        await cargarInventario();
    } catch (error) {
        alert('Error al eliminar producto: ' + (error as Error).message);
    }
}
window.eliminarProducto = eliminarProducto;

// --- ADMIN: Inventario y Movimientos ---
async function cargarInventario() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('productos').select('id, nombre, stock, precio_costo').order('nombre');
        if (error) throw error;
        inventario = data || [];
        renderizarInventario();
        calcularKPIsInventario();
    } catch (error) {
        console.error("Error al cargar inventario:", (error as Error).message);
    }
}

function calcularKPIsInventario() {
    const valorTotal = inventario.reduce((sum, p) => sum + (p.stock * (p.precio_costo || 0)), 0);
    const unidadesTotales = inventario.reduce((sum, p) => sum + p.stock, 0);
    const bajosStock = inventario.filter(p => p.stock > 0 && p.stock <= 5).length;
    const sinStock = inventario.filter(p => p.stock === 0).length;

    document.getElementById('kpiValorInventario').textContent = `S/ ${valorTotal.toFixed(2)}`;
    document.getElementById('kpiUnidadesTotales').textContent = unidadesTotales.toString();
    document.getElementById('kpiBajosStockInventario').textContent = bajosStock.toString();
    document.getElementById('kpiSinStock').textContent = sinStock.toString();
}

function renderizarInventario() {
    const tbody = document.getElementById('inventarioTableBody');
    // FIX: Cast HTML element to access its properties
    const searchTerm = (document.getElementById('inventorySearchInput') as HTMLInputElement).value.toLowerCase();
    const productosFiltrados = inventario.filter(p => p.nombre.toLowerCase().includes(searchTerm));

    if (productosFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem;">No se encontraron productos.</td></tr>`;
        return;
    }

    tbody.innerHTML = productosFiltrados.map(p => `
        <tr class="clickable" onclick="verMovimientos(${p.id}, '${p.nombre.replace(/'/g, "\\'")}')">
            <td>${p.nombre}</td>
            <td style="font-weight: 600; color: ${p.stock <= 5 ? (p.stock === 0 ? 'var(--danger)' : 'var(--warning)') : 'var(--text-dark)'};">${p.stock}</td>
            <td>S/ ${(p.stock * (p.precio_costo || 0)).toFixed(2)}</td>
            <td class="table-actions" onclick="event.stopPropagation();">
                <button class="btn-lotes" onclick="abrirModalIngresoStock(${p.id}, event)">+ Registrar Ingreso</button>
            </td>
        </tr>
    `).join('');
}
window.renderizarInventario = renderizarInventario;

async function verMovimientos(productoId, nombreProducto) {
    mostrarVistaAdmin('movimientos');
    document.getElementById('movimientosTitle').textContent = `Historial de Movimientos para: ${nombreProducto}`;
    const tbody = document.getElementById('movimientosTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Cargando historial...</td></tr>';
    try {
        const { data, error } = await supabaseClient
            .from('movimientos_inventario')
            .select('*')
            .eq('producto_id', productoId)
            .order('fecha_movimiento', { ascending: false });

        if (error) throw error;
        movimientos = data || [];
        renderizarMovimientos();
    } catch (error) {
         tbody.innerHTML = `<tr><td colspan="6" class="error-info">${(error as Error).message}</td></tr>`;
    }
}
window.verMovimientos = verMovimientos;

function renderizarMovimientos() {
    const tbody = document.getElementById('movimientosTableBody');
    if (movimientos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">No hay movimientos registrados para este producto.</td></tr>`;
        return;
    }

    tbody.innerHTML = movimientos.map(m => {
        const esIngreso = m.tipo_movimiento.startsWith('INGRESO');
        return `
        <tr>
            <td>${new Date(m.fecha_movimiento).toLocaleString()}</td>
            <td class="movimiento-tipo ${esIngreso ? 'ingreso' : 'salida'}">${m.tipo_movimiento.replace(/_/g, ' ')}</td>
            <td style="font-weight: 600;">${m.cantidad}</td>
            <td>${m.stock_resultante}</td>
            <td>${m.usuario_email || 'Sistema'}</td>
            <td>${m.referencia_id || 'N/A'}</td>
        </tr>
        `
    }).join('');
}

async function abrirModalIngresoStock(productoId, event) {
    event.stopPropagation();
    const producto = productosAdmin.find(p => p.id == productoId);
    if (!producto) {
        alert("Producto no encontrado. Por favor, recarga la página.");
        return;
    }
    
    // Adaptar modal dinámicamente
    const gestionaLotes = producto.gestiona_lotes;
    document.getElementById('ingresoStockModalTitle').textContent = gestionaLotes ? 'Registrar Ingreso de Stock' : `Registrar Ingreso: ${producto.nombre}`;
    document.getElementById('lotesContainerTitle').style.display = gestionaLotes ? 'block' : 'none';
    document.getElementById('btnAddLote').style.display = gestionaLotes ? 'inline-block' : 'none';

    // FIX: Cast HTML elements and convert number to string for value property
    (document.getElementById('ingresoProductoId') as HTMLInputElement).value = productoId.toString();
    (document.getElementById('ingresoStockForm') as HTMLFormElement).reset();
    const container = document.getElementById('lotesParaIngresarContainer');
    container.innerHTML = '';
    agregarLoteParaIngreso(gestionaLotes);
    document.getElementById('ingresoStockModal').classList.add('show');
}
window.abrirModalIngresoStock = abrirModalIngresoStock;

function cerrarModalIngresoStock() {
    document.getElementById('ingresoStockModal').classList.remove('show');
}
window.cerrarModalIngresoStock = cerrarModalIngresoStock;

function agregarLoteParaIngreso(gestionaLotes = true) {
    const container = document.getElementById('lotesParaIngresarContainer');
    const div = document.createElement('div');
    div.className = 'lote-item lote-ingreso-item';
    
    if (gestionaLotes) {
        div.style.gridTemplateColumns = '1fr 1fr 1fr auto';
        div.innerHTML = `
            <div class="form-group" style="margin: 0;"><label>N° Lote</label><input type="text" class="loteNumeroIngreso"></div>
            <div class="form-group" style="margin: 0;"><label>Vencimiento</label><input type="date" class="loteFechaIngreso"></div>
            <div class="form-group" style="margin: 0;"><label>Cantidad</label><input type="number" min="1" class="loteCantidadIngreso" required></div>
            <button type="button" class="btn-danger" style="align-self: end; margin-bottom: 1rem;" onclick="this.parentElement.remove()">×</button>
        `;
    } else {
        // Simplificado para productos sin lote
        div.style.gridTemplateColumns = '1fr';
        div.innerHTML = `
            <div class="form-group" style="margin: 0;"><label>Cantidad a Ingresar</label><input type="number" min="1" class="loteCantidadIngreso" required></div>
        `;
    }
    container.appendChild(div);
}

function agregarLoteParaIngresoDesdeBoton() {
    // FIX: Cast HTML element to access its properties
    const productoId = (document.getElementById('ingresoProductoId') as HTMLInputElement).value;
    const producto = productosAdmin.find(p => p.id == productoId);
    agregarLoteParaIngreso(producto ? producto.gestiona_lotes : true);
}
window.agregarLoteParaIngresoDesdeBoton = agregarLoteParaIngresoDesdeBoton;

async function registrarIngresoStock(event) {
    event.preventDefault();
    // FIX: Cast HTML elements to access their properties
    const productoId = (document.getElementById('ingresoProductoId') as HTMLInputElement).value;
    const comprobante = (document.getElementById('ingresoComprobante') as HTMLInputElement).value;
    const proveedor = (document.getElementById('ingresoProveedor') as HTMLInputElement).value;
    
    const lotes = [];
    document.querySelectorAll('.lote-ingreso-item').forEach(item => {
        const cantidadInput = item.querySelector('.loteCantidadIngreso') as HTMLInputElement;
        const cantidad = cantidadInput ? cantidadInput.value : null;

        if (cantidad && parseInt(cantidad) > 0) {
            const loteNumeroInput = item.querySelector('.loteNumeroIngreso') as HTMLInputElement;
            const fechaIngresoInput = item.querySelector('.loteFechaIngreso') as HTMLInputElement;

            lotes.push({
                numero_lote: loteNumeroInput ? loteNumeroInput.value || null : `SINLOTE-${Date.now()}`,
                fecha_vencimiento: fechaIngresoInput ? fechaIngresoInput.value || null : null,
                cantidad: parseInt(cantidad)
            });
        }
    });

    if (lotes.length === 0) {
        alert("Debes añadir al menos un item con una cantidad mayor a cero.");
        return;
    }

    try {
        const { error } = await supabaseClient.rpc('registrar_ingreso_stock', {
            id_producto: productoId,
            lotes: lotes,
            comprobante: comprobante,
            prov: proveedor
        });

        if (error) throw error;

        mostrarNotificacion('✅ Ingreso de stock registrado con éxito.');
        cerrarModalIngresoStock();
        await cargarInventario();
        await cargarProductos();
    } catch (error) {
        alert("Error al registrar el ingreso: " + (error as Error).message);
    }
}
window.registrarIngresoStock = registrarIngresoStock;

function seleccionarImagenVariante(previewElement) {
    currentVariantPreviewElement = previewElement;
    document.getElementById('variantImageFile').click();
}
window.seleccionarImagenVariante = seleccionarImagenVariante;

async function subirImagenVariante(event) {
    // FIX: Cast HTML element to access its properties
    const file = (event.target as HTMLInputElement).files[0];
    if (!file || !currentVariantPreviewElement) return;

    currentVariantPreviewElement.innerHTML = `<div style="width: 100%; height: 4px; background: var(--secondary); animation: pulse 1s infinite;"></div>`;

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error.message || 'Error desconocido desde Cloudinary.');

        const imageUrl = data.secure_url;
        currentVariantPreviewElement.dataset.imageUrl = imageUrl;
        currentVariantPreviewElement.innerHTML = `<img src="${optimizarImagenUrl(imageUrl, 100)}" alt="Preview">`;
        mostrarNotificacion('🖼️ Imagen de variante asignada.');

    } catch (error) {
        let friendlyMessage = 'Error al subir la imagen: ' + (error as Error).message;
        if ((error as Error).message && ((error as Error).message.includes('upload preset') || (error as Error).message.includes('not found'))) {
            friendlyMessage += `\n\n➡️ Solución: Verifica que el "upload_preset" ('${CLOUDINARY_UPLOAD_PRESET}') exista en tu cuenta de Cloudinary y que su modo sea "Unsigned". Revisa la sección de Ayuda para más detalles.`;
        } else if ((error as Error).message && (error as Error).message.includes('cloud_name')) {
            friendlyMessage += `\n\n➡️ Solución: Verifica que el "cloud_name" ('${CLOUDINARY_CLOUD_NAME}') sea correcto.`;
        }
        alert(friendlyMessage);
        currentVariantPreviewElement.innerHTML = '<span>🖼️</span>';
    } finally {
        // FIX: Cast HTML element to access its properties
        (event.target as HTMLInputElement).value = '';
        currentVariantPreviewElement = null;
    }
}
window.subirImagenVariante = subirImagenVariante;

function optimizarImagenUrl(url, width = 600) {
    if (url && url.includes('res.cloudinary.com') && !url.includes('/upload/c_')) {
        const parts = url.split('/upload/');
        if (parts.length === 2) {
            return `${parts[0]}/upload/c_fill,g_auto,q_auto,f_auto,w_${width}/${parts[1]}`;
        }
    }
    return url;
}

function descargarPlantilla() {
    const data = [
        ["nombre", "marca", "categoria_id", "descripcion", "precio", "precio_costo", "icon", "badge", "activo", "gestiona_lotes"],
        ["iPhone 15 Pro", "Apple", 1, "Smartphone premium con la última tecnología", 4599.00, 3200.00, "📱", "Nuevo", true, true]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "plantilla_productos_red51.xlsx");
    mostrarNotificacion('📥 Plantilla de Excel (.xlsx) descargada. El stock se gestiona desde el Módulo de Inventario.');
}
window.descargarPlantilla = descargarPlantilla;

async function importarProductos(event) {
    // FIX: Cast HTML element to access its properties
    const file = (event.target as HTMLInputElement).files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            document.getElementById('loadingAdmin').style.display = 'block';
            let productosImportados = [];
            const fileContent = e.target.result;

            if (file.name.endsWith('.csv')) {
                // FIX: Check if fileContent is a string before splitting
                if (typeof fileContent === 'string') {
                    const lines = fileContent.split('\n');
                    const headers = lines[0].split(',').map(h => h.trim());
                    productosImportados = lines.slice(1).map(line => {
                        if (!line.trim()) return null;
                        const values = line.split(',').map(v => v.trim());
                        const producto = {};
                        headers.forEach((header, i) => producto[header] = values[i] || null);
                        return producto;
                    }).filter(Boolean);
                }
            } else { // Handle .xls, .xlsx
                // FIX: Check if fileContent is an ArrayBuffer
                if (fileContent instanceof ArrayBuffer) {
                    const workbook = XLSX.read(new Uint8Array(fileContent), { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    productosImportados = XLSX.utils.sheet_to_json(worksheet);
                }
            }

            if (productosImportados.length === 0) {
                 throw new Error('No se encontraron productos válidos en el archivo.');
            }
            
            const productosParaSupabase = productosImportados.map(p => ({
                nombre: p.nombre,
                marca: p.marca,
                categoria_id: p.categoria_id ? parseInt(p.categoria_id) : null,
                descripcion: p.descripcion,
                precio: p.precio ? parseFloat(p.precio) : 0,
                precio_costo: p.precio_costo ? parseFloat(p.precio_costo) : 0,
                stock: 0, // El stock ahora se gestiona por lotes
                icon: p.icon,
                badge: p.badge,
                activo: String(p.activo).toLowerCase() === 'true',
                gestiona_lotes: p.gestiona_lotes === undefined ? true : String(p.gestiona_lotes).toLowerCase() === 'true'
            })).filter(p => p.nombre && p.marca && p.categoria_id && p.precio);
            
            if (productosParaSupabase.length === 0) {
                throw new Error('Los productos en el archivo no tienen el formato correcto (nombre, marca, categoria_id y precio son requeridos).');
            }
            
            if (!confirm(`Se importarán ${productosParaSupabase.length} productos. Recuerda registrar sus ingresos de stock desde el Módulo de Inventario. ¿Continuar?`)) {
                 document.getElementById('loadingAdmin').style.display = 'none';
                 return;
            }

            const { error } = await supabaseClient.from('productos').insert(productosParaSupabase);
            if (error) throw error;
            
            mostrarNotificacion(`✅ ${productosParaSupabase.length} productos importados exitosamente.`);
            await cargarProductosAdmin();
            await cargarProductos();
            await cargarInventario();
        } catch (error) {
            alert('Error al importar productos: ' + (error as Error).message);
        } finally {
            document.getElementById('loadingAdmin').style.display = 'none';
            // FIX: Cast HTML element to access its properties
            (event.target as HTMLInputElement).value = '';
        }
    };
    
    if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
}
window.importarProductos = importarProductos;

// --- ADMIN: Importación de Stock ---
function descargarPlantillaStock() {
    const data = [
        ["nombre_producto", "cantidad", "numero_lote", "fecha_vencimiento", "factura_compra", "proveedor"],
        ["iPhone 15 Pro", 10, "LOTE-IPHONE-001", "2026-01-01", "F001-123", "Proveedor Apple"],
        ["Cable USB-C", 50, "", "", "F001-124", "Proveedor Accesorios"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock");
    XLSX.writeFile(wb, "plantilla_ingreso_stock.xlsx");
    mostrarNotificacion('📥 Plantilla de stock descargada. "numero_lote" y "fecha_vencimiento" son opcionales.');
}
window.descargarPlantillaStock = descargarPlantillaStock;

async function importarStock(event) {
    // FIX: Cast HTML element to access its properties
    const file = (event.target as HTMLInputElement).files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            document.getElementById('loadingAdmin').style.display = 'block';
            const fileContent = e.target.result;
            let stockItems;

            if (file.name.endsWith('.csv')) {
                // FIX: Check if fileContent is a string before splitting
                if (typeof fileContent === 'string') {
                    const lines = fileContent.split('\n');
                    const headers = lines[0].split(',').map(h => h.trim());
                    stockItems = lines.slice(1).map(line => {
                        if (!line.trim()) return null;
                        const values = line.split(',').map(v => v.trim());
                        const item = {};
                        headers.forEach((header, i) => item[header] = values[i] || null);
                        return item;
                    }).filter(Boolean);
                }
            } else {
                // FIX: Check if fileContent is an ArrayBuffer
                if (fileContent instanceof ArrayBuffer) {
                    const workbook = XLSX.read(new Uint8Array(fileContent), { type: 'array', cellDates: true });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    stockItems = XLSX.utils.sheet_to_json(worksheet);
                }
            }

            if (!stockItems || stockItems.length === 0) throw new Error('No se encontraron items de stock en el archivo.');

            const productosPorProcesar = {};
            const productosNoEncontrados = new Set();
            let itemsValidos = 0;

            for (const item of stockItems) {
                const nombre = item.nombre_producto;
                const cantidad = parseInt(item.cantidad);

                if (!nombre || !cantidad || isNaN(cantidad)) continue;
                
                itemsValidos++;
                const producto = productosAdmin.find(p => p.nombre.toLowerCase() === nombre.toLowerCase());

                if (!producto) {
                    productosNoEncontrados.add(nombre);
                    continue;
                }

                if (!productosPorProcesar[producto.id]) {
                    productosPorProcesar[producto.id] = {
                        producto: producto,
                        lotes: [],
                        comprobante: item.factura_compra || `IMPORT-${new Date().toISOString().split('T')[0]}`,
                        proveedor: item.proveedor || 'Importación Masiva'
                    };
                }
                
                // Si la fecha es un objeto Date de xlsx, la formateamos
                let fechaVencimiento = item.fecha_vencimiento || null;
                if (fechaVencimiento instanceof Date) {
                    fechaVencimiento = fechaVencimiento.toISOString().split('T')[0];
                }

                productosPorProcesar[producto.id].lotes.push({
                    numero_lote: producto.gestiona_lotes ? (item.numero_lote || null) : `SINLOTE-${Date.now()}`,
                    fecha_vencimiento: producto.gestiona_lotes ? (fechaVencimiento || null) : null,
                    cantidad: cantidad
                });
            }
            
            const numProductosAfectados = Object.keys(productosPorProcesar).length;
            if (numProductosAfectados === 0) {
                throw new Error(`De ${itemsValidos} items válidos, no se encontró ningún producto correspondiente en la base de datos. Productos no encontrados: ${Array.from(productosNoEncontrados).join(', ')}`);
            }

            if (!confirm(`Se procesarán ingresos de stock para ${numProductosAfectados} producto(s) diferente(s). ${productosNoEncontrados.size > 0 ? `${productosNoEncontrados.size} producto(s) no fueron encontrados y serán omitidos.` : ''} ¿Deseas continuar?`)) {
                return;
            }

            // FIX: Type data as any to access its properties
            const promesas = Object.values(productosPorProcesar).map((data: any) => 
                supabaseClient.rpc('registrar_ingreso_stock', {
                    id_producto: data.producto.id,
                    lotes: data.lotes,
                    comprobante: data.comprobante,
                    prov: data.proveedor
                })
            );
            
            await Promise.all(promesas);

            let mensajeFinal = `✅ Importación completada. Se actualizó el stock para ${numProductosAfectados} producto(s).`;
            if (productosNoEncontrados.size > 0) {
                mensajeFinal += `\n\n⚠️ Productos no encontrados y omitidos: ${Array.from(productosNoEncontrados).join(', ')}. Por favor, créalos en la pestaña 'Productos' antes de importar su stock.`;
            }
            alert(mensajeFinal);

            await cargarInventario();
            await cargarProductos();

        } catch (error) {
            alert('Error durante la importación de stock: ' + (error as Error).message);
        } finally {
             document.getElementById('loadingAdmin').style.display = 'none';
             (event.target as HTMLInputElement).value = ''; // Reset file input
        }
    };

    if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
}
window.importarStock = importarStock;

// --- ADMIN: Reportes (NUEVA ESTRUCTURA) ---

function inicializarReportes() {
    const hoy = new Date();
    const haceUnMes = new Date();
    haceUnMes.setMonth(haceUnMes.getMonth() - 1);
    const hoyStr = hoy.toISOString().split('T')[0];
    const haceUnMesStr = haceUnMes.toISOString().split('T')[0];

    // Fechas para Resumen
    // FIX: Cast HTML elements to access their properties
    (document.getElementById('reporteFechaInicio') as HTMLInputElement).value = haceUnMesStr;
    (document.getElementById('reporteFechaFin') as HTMLInputElement).value = hoyStr;
    // Fechas para Ventas por Producto
    (document.getElementById('reporteProductoFechaInicio') as HTMLInputElement).value = haceUnMesStr;
    (document.getElementById('reporteProductoFechaFin') as HTMLInputElement).value = hoyStr;
    // Fechas para Compras
    (document.getElementById('reporteComprasFechaInicio') as HTMLInputElement).value = haceUnMesStr;
    (document.getElementById('reporteComprasFechaFin') as HTMLInputElement).value = hoyStr;

    // Llenar selector de productos
    const selector = document.getElementById('reporteProductoSelect') as HTMLSelectElement;
    if (productosAdmin.length > 0) {
        selector.innerHTML = '<option value="">-- Todos los productos --</option>' + 
            productosAdmin.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    } else {
        selector.innerHTML = '<option value="">No hay productos</option>';
    }
}

function mostrarSubVistaReporte(vista) {
    // FIX: Cast element to HTMLElement to access style property
    document.querySelectorAll('.reporte-subview').forEach(v => ((v as HTMLElement).style.display = 'none'));
    document.querySelectorAll('#reportesNav .admin-nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(`reporte${vista.charAt(0).toUpperCase() + vista.slice(1)}View`).style.display = 'block';
    document.getElementById(`navBtn${vista.charAt(0).toUpperCase() + vista.slice(1)}`).classList.add('active');
}
window.mostrarSubVistaReporte = mostrarSubVistaReporte;

async function generarReporteVentas() {
    // Esta función ahora solo controla el reporte de Resumen
    // FIX: Cast HTML elements to access their properties
    const fechaInicio = (document.getElementById('reporteFechaInicio') as HTMLInputElement).value;
    const fechaFin = (document.getElementById('reporteFechaFin') as HTMLInputElement).value;
    
    if (!fechaInicio || !fechaFin) {
        alert("Por favor, selecciona un rango de fechas.");
        return;
    }

    const fechaFinCompleta = new Date(fechaFin);
    fechaFinCompleta.setHours(23, 59, 59, 999);

    try {
        document.getElementById('loadingAdmin').style.display = 'block';
        const { data, error } = await supabaseClient
            .from('pedidos')
            .select('*')
            .gte('fecha_pedido', new Date(fechaInicio).toISOString())
            .lte('fecha_pedido', fechaFinCompleta.toISOString())
            .order('fecha_pedido', { ascending: false });

        if (error) throw error;
        
        const pedidosFiltrados = data || [];
        datosReporteActual = [];
        let totalIngresos = 0;
        let totalCosto = 0;

        pedidosFiltrados.forEach(pedido => {
            (pedido.productos || []).forEach(item => {
                const costoUnitario = item.costo_unitario || 0;
                const costoTotalItem = costoUnitario * item.cantidad;
                const gananciaItem = item.subtotal - costoTotalItem;

                totalIngresos += item.subtotal;
                totalCosto += costoTotalItem;
                
                datosReporteActual.push({
                    numero_pedido: pedido.numero_pedido,
                    fecha: new Date(pedido.fecha_pedido).toLocaleDateString(),
                    cliente: pedido.nombre_cliente,
                    producto: item.producto,
                    cantidad: item.cantidad,
                    total_venta: item.subtotal,
                    costo_total: costoTotalItem,
                    ganancia: gananciaItem
                });
            });
        });
        
        const gananciaBruta = totalIngresos - totalCosto;
        const margenGanancia = totalIngresos > 0 ? (gananciaBruta / totalIngresos) * 100 : 0;

        document.getElementById('reporteKpiIngresos').textContent = `S/ ${totalIngresos.toFixed(2)}`;
        document.getElementById('reporteKpiCosto').textContent = `S/ ${totalCosto.toFixed(2)}`;
        document.getElementById('reporteKpiGanancia').textContent = `S/ ${gananciaBruta.toFixed(2)}`;
        document.getElementById('reporteKpiMargen').textContent = `${margenGanancia.toFixed(2)} %`;
        
        renderizarReporteTabla();

    } catch (error) {
        alert('Error al generar el reporte: ' + (error as Error).message);
    } finally {
        document.getElementById('loadingAdmin').style.display = 'none';
    }
}
window.generarReporteVentas = generarReporteVentas;

function renderizarReporteTabla() {
    const tbody = document.getElementById('reportesTableBody');
    if (datosReporteActual.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;">No se encontraron ventas en el período seleccionado.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = datosReporteActual.map(item => `
        <tr>
            <td>${item.numero_pedido}</td>
            <td>${item.fecha}</td>
            <td>${item.cliente}</td>
            <td>${item.producto}</td>
            <td>${item.cantidad}</td>
            <td>S/ ${item.total_venta.toFixed(2)}</td>
            <td>S/ ${item.costo_total.toFixed(2)}</td>
            <td style="font-weight: 600; color: ${item.ganancia >= 0 ? 'var(--success)' : 'var(--danger)'};">S/ ${item.ganancia.toFixed(2)}</td>
        </tr>
    `).join('');
}

async function generarReporteVentasPorProducto() {
    // FIX: Cast HTML elements to access their properties
    const productoId = (document.getElementById('reporteProductoSelect') as HTMLSelectElement).value;
    const fechaInicio = (document.getElementById('reporteProductoFechaInicio') as HTMLInputElement).value;
    const fechaFin = (document.getElementById('reporteProductoFechaFin') as HTMLInputElement).value;
    const tbody = document.getElementById('reporteVentasPorProductoTableBody');
    
    if (!fechaInicio || !fechaFin) {
        alert("Por favor, selecciona un rango de fechas.");
        return;
    }

    tbody.innerHTML = `<tr><td colspan="5" class="loading">Generando reporte...</td></tr>`;

    const fechaFinCompleta = new Date(fechaFin);
    fechaFinCompleta.setHours(23, 59, 59, 999);

    try {
        const { data, error } = await supabaseClient
            .from('pedidos')
            .select('fecha_pedido, numero_pedido, nombre_cliente, productos')
            .gte('fecha_pedido', new Date(fechaInicio).toISOString())
            .lte('fecha_pedido', fechaFinCompleta.toISOString())
            .order('fecha_pedido', { ascending: false });

        if (error) throw error;

        const ventasFiltradas = [];
        (data || []).forEach(pedido => {
            (pedido.productos || []).forEach(item => {
                if (!productoId || item.id == productoId) {
                    ventasFiltradas.push({
                        fecha: new Date(pedido.fecha_pedido).toLocaleDateString(),
                        numero_pedido: pedido.numero_pedido,
                        cliente: pedido.nombre_cliente,
                        cantidad: item.cantidad,
                        total: item.subtotal,
                        producto_nombre: item.producto // Para el caso "Todos"
                    });
                }
            });
        });
        
        if(ventasFiltradas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">No se encontraron ventas para este producto en el período seleccionado.</td></tr>`;
            return;
        }
        
        // Si el filtro es para todos, se añade la columna producto
        const allProductsMode = !productoId;
        if(allProductsMode) {
           tbody.parentElement.querySelector('thead tr').innerHTML = `<th>Fecha</th><th>Producto</th><th>N° Pedido</th><th>Cliente</th><th>Cantidad</th><th>Total Venta</th>`;
        } else {
           tbody.parentElement.querySelector('thead tr').innerHTML = `<th>Fecha</th><th>N° Pedido</th><th>Cliente</th><th>Cantidad Vendida</th><th>Total Venta</th>`;
        }

        tbody.innerHTML = ventasFiltradas.map(venta => `
            <tr>
                <td>${venta.fecha}</td>
                ${allProductsMode ? `<td>${venta.producto_nombre}</td>` : ''}
                <td>${venta.numero_pedido}</td>
                <td>${venta.cliente}</td>
                <td>${venta.cantidad}</td>
                <td>S/ ${venta.total.toFixed(2)}</td>
            </tr>
        `).join('');

    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="error-info">${(error as Error).message}</td></tr>`;
    }
}
window.generarReporteVentasPorProducto = generarReporteVentasPorProducto;

async function generarReporteCompras() {
    // FIX: Cast HTML elements to access their properties
    const fechaInicio = (document.getElementById('reporteComprasFechaInicio') as HTMLInputElement).value;
    const fechaFin = (document.getElementById('reporteComprasFechaFin') as HTMLInputElement).value;
    const tbody = document.getElementById('reporteComprasTableBody');

    if (!fechaInicio || !fechaFin) {
        alert("Por favor, selecciona un rango de fechas.");
        return;
    }

    tbody.innerHTML = `<tr><td colspan="6" class="loading">Generando reporte...</td></tr>`;

    const fechaFinCompleta = new Date(fechaFin);
    fechaFinCompleta.setHours(23, 59, 59, 999);
    
    try {
        const { data, error } = await supabaseClient
            .from('movimientos_inventario')
            .select('*, productos(nombre)')
            .eq('tipo_movimiento', 'INGRESO_COMPRA')
            .gte('fecha_movimiento', new Date(fechaInicio).toISOString())
            .lte('fecha_movimiento', fechaFinCompleta.toISOString())
            .order('fecha_movimiento', { ascending: false });
        
        if (error) throw error;
        
        if(data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">No se encontraron compras en el período seleccionado.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = data.map(item => `
            <tr>
                <td>${new Date(item.fecha_movimiento).toLocaleString()}</td>
                <td>${item.productos.nombre}</td>
                <td>${item.cantidad}</td>
                <td>${item.referencia_id || 'N/A'}</td>
                <td>${item.proveedor || 'N/A'}</td>
                <td>${item.usuario_email || 'Sistema'}</td>
            </tr>
        `).join('');
        
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="error-info">${(error as Error).message}</td></tr>`;
    }
}
window.generarReporteCompras = generarReporteCompras;

function exportarReporteExcel() {
    if (datosReporteActual.length === 0) {
        alert("No hay datos para exportar. Primero genera un reporte en la pestaña 'Resumen de Ventas'.");
        return;
    }
    
    const datosParaExportar = datosReporteActual.map(item => ({
        "N° Pedido": item.numero_pedido,
        "Fecha": item.fecha,
        "Cliente": item.cliente,
        "Producto": item.producto,
        "Cantidad": item.cantidad,
        "Total Venta (S/)": item.total_venta.toFixed(2),
        "Costo Total (S/)": item.costo_total.toFixed(2),
        "Ganancia (S/)": item.ganancia.toFixed(2)
    }));
    
    const ws = XLSX.utils.json_to_sheet(datosParaExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte de Ventas");
    
    // FIX: Cast HTML elements to access their properties
    const fechaInicio = (document.getElementById('reporteFechaInicio') as HTMLInputElement).value;
    const fechaFin = (document.getElementById('reporteFechaFin') as HTMLInputElement).value;
    XLSX.writeFile(wb, `Reporte_Ventas_${fechaInicio}_a_${fechaFin}.xlsx`);
    mostrarNotificacion('📊 Reporte de Excel (.xlsx) descargado.');
}
window.exportarReporteExcel = exportarReporteExcel;


function mostrarNotificacion(mensaje) {
    const notif = document.createElement('div');
    notif.textContent = mensaje;
    notif.style.cssText = `position: fixed; top: 100px; right: 20px; background: var(--dark); color: white; padding: 1rem 2rem; border-radius: 10px; box-shadow: var(--shadow-lg); z-index: 10000; font-weight: 600; animation: fadeInOut 3s ease-in-out forwards;`;
    const style = document.createElement('style');
    style.id = 'notif-style';
    if (!document.getElementById('notif-style')) {
        style.innerHTML = `@keyframes fadeInOut { 0% { opacity: 0; transform: translateY(-20px); } 10% { opacity: 1; transform: translateY(0); } 90% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-20px); } }`;
        document.head.appendChild(style);
    }
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

window.onclick = function(event) {
    if (event.target == document.getElementById('cartModal')) cerrarCarrito();
    if (event.target == document.getElementById('productoModal')) cerrarModalProducto();
    if (event.target == document.getElementById('categoriaModal')) cerrarModalCategoria();
    if (event.target == document.getElementById('pedidoModal')) cerrarModalPedido();
    if (event.target == document.getElementById('detalleProductoModal')) cerrarModalDetalleProducto();
    if (event.target == document.getElementById('ingresoStockModal')) cerrarModalIngresoStock();
}

inicializarSupabase();
setupGlobalEventListeners();
