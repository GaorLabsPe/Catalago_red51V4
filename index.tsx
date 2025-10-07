/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// @ts-nocheck

document.addEventListener('DOMContentLoaded', () => {
    // --- STATE VARIABLES ---
    const SUPABASE_URL = 'https://zejzrujrspeoszpfbjce.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplanpydWpyc3Blb3N6cGZiamNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2MDMyNDMsImV4cCI6MjA3NTE3OTI0M30.UAi4jQ0BH1hphW7OEh4JWP4hdVJ4CmvX6x4CyP2ak-U';
    const CLOUDINARY_CLOUD_NAME = 'dvj68er8s';
    const CLOUDINARY_UPLOAD_PRESET = 'red51_productos';
    
    let carrito = [];
    let supabaseClient = null;
    let categoriaActual = 'todos';
    let productos = [];
    let categorias = [];
    let pedidos = [];
    let usuarioActual = null;
    let configuracion = {};
    let mapa;
    let estadoPedidoActual = 'todos';
    let pedidosChannel = null;
    const estadosPosibles = ['pendiente_pago', 'pago_confirmado', 'en_preparacion', 'enviado', 'entregado', 'cancelado'];

    // --- DOM ELEMENTS ---
    const tiendaView = document.getElementById('tiendaView');
    const adminView = document.getElementById('adminView');
    const heroSection = document.getElementById('heroSection');
    const categoryFilter = document.getElementById('categoryFilter');
    const productsGrid = document.getElementById('productsGrid');
    const loadingProducts = document.getElementById('loadingProducts');
    const loginSection = document.getElementById('loginSection');
    const adminPanel = document.getElementById('adminPanel');
    const adminEmail = document.getElementById('adminEmail');
    const cartCount = document.getElementById('cartCount');

    // Modals
    const cartModal = document.getElementById('cartModal');
    const productoModal = document.getElementById('productoModal');
    const categoriaModal = document.getElementById('categoriaModal');
    const pedidoModal = document.getElementById('pedidoModal');
    const mapModal = document.getElementById('mapModal');

    // Forms
    const loginForm = document.getElementById('loginForm');
    const configForm = document.getElementById('configForm');
    const productoForm = document.getElementById('productoForm');
    const categoriaForm = document.getElementById('categoriaForm');

    // --- INITIALIZATION ---
    async function inicializarApp() {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        await cargarConfiguracion();
        await cargarCategorias();
        await cargarProductos();
        await verificarSesion();
        setupEventListeners();
    }

    // --- EVENT LISTENERS SETUP ---
    function setupEventListeners() {
        // Navigation
        document.getElementById('logoContainer').addEventListener('click', mostrarTienda);
        document.getElementById('btnTienda').addEventListener('click', mostrarTienda);
        document.getElementById('btnAdmin').addEventListener('click', mostrarAdmin);
        document.getElementById('cartBtn').addEventListener('click', abrirCarrito);

        // Modals
        document.getElementById('closeCartBtn').addEventListener('click', cerrarCarrito);
        document.getElementById('closeProductModalBtn').addEventListener('click', cerrarModalProducto);
        document.getElementById('closeCategoryModalBtn').addEventListener('click', cerrarModalCategoria);
        document.getElementById('closePedidoModalBtn').addEventListener('click', cerrarModalPedido);
        document.getElementById('closeMapModalBtn').addEventListener('click', cerrarModalMapa);
        document.getElementById('continueShoppingBtn').addEventListener('click', cerrarYLimpiar);
        
        // Forms
        loginForm.addEventListener('submit', iniciarSesion);
        configForm.addEventListener('submit', guardarConfiguracion);
        productoForm.addEventListener('submit', guardarProducto);
        categoriaForm.addEventListener('submit', guardarCategoria);

        // Admin Panel
        document.getElementById('logoutBtn').addEventListener('click', cerrarSesion);
        document.querySelector('.admin-nav').addEventListener('click', handleAdminNav);
        document.getElementById('downloadCsvBtn').addEventListener('click', descargarPlantilla);
        document.getElementById('importCsvBtn').addEventListener('click', () => document.getElementById('importFile').click());
        document.getElementById('importFile').addEventListener('change', importarProductos);
        document.getElementById('addProductBtn').addEventListener('click', abrirModalProducto);
        document.getElementById('addCategoryBtn').addEventListener('click', abrirModalCategoria);
        
        // Product Modal Inputs
        document.getElementById('uploadImageBtn').addEventListener('click', () => document.getElementById('imageFile').click());
        document.getElementById('imageFile').addEventListener('change', subirImagenCloudinary);
        document.getElementById('productoImagen').addEventListener('input', previewImagen);
        document.getElementById('categoriaNombre').addEventListener('input', (e) => generarSlug(e.target.value));

        // Event Delegation for dynamic content
        categoryFilter.addEventListener('click', handleCategoryFilter);
        productsGrid.addEventListener('click', handleProductGridClick);
        document.getElementById('cartContent').addEventListener('click', handleCartActions);
        document.getElementById('cartContent').addEventListener('submit', realizarPedido);
        document.getElementById('pedidosFilterContainer').addEventListener('click', handlePedidosFilter);
        document.getElementById('adminPedidosTable').addEventListener('click', handlePedidosTableClick);
        document.getElementById('adminPedidosTable').addEventListener('change', handlePedidosTableChange);
        document.getElementById('adminProductsTable').addEventListener('click', handleProductsTableActions);
        document.getElementById('adminCategoriesTable').addEventListener('click', handleCategoriesTableActions);

        // Window-level listener for closing modals
        window.addEventListener('click', (event) => {
            if (event.target === cartModal) cerrarCarrito();
            if (event.target === productoModal) cerrarModalProducto();
            if (event.target === categoriaModal) cerrarModalCategoria();
            if (event.target === pedidoModal) cerrarModalPedido();
            if (event.target === mapModal) cerrarModalMapa();
        });
    }

    // --- EVENT HANDLERS ---
    function handleAdminNav(event) {
        if (event.target.matches('.admin-nav-btn')) {
            const view = event.target.dataset.view;
            mostrarVistaAdmin(view);
        }
    }

    function handleCategoryFilter(event) {
        if (event.target.matches('.filter-btn')) {
            filtrarCategoria(event.target.dataset.slug);
        }
    }

    function handlePedidosFilter(event) {
        if (event.target.matches('.filter-btn')) {
            filtrarPedidosPorEstado(event.target.dataset.estado);
        }
    }

    function handleProductGridClick(event) {
        if (event.target.matches('.add-to-cart-btn')) {
            const productoId = parseInt(event.target.dataset.id, 10);
            agregarAlCarrito(productoId);
        }
    }

    function handleCartActions(event) {
        const target = event.target;
        if (target.matches('.qty-btn')) {
            const index = parseInt(target.dataset.index, 10);
            const change = parseInt(target.dataset.change, 10);
            cambiarCantidad(index, change);
        }
        if (target.matches('.remove-btn')) {
            const index = parseInt(target.dataset.index, 10);
            eliminarItem(index);
        }
        if (target.matches('#getLocationBtn')) {
            obtenerUbicacionCliente(target);
        }
    }

    function handlePedidosTableClick(event) {
        const row = event.target.closest('tr');
        if (!row || !row.dataset.id) return;

        // Allow select interaction without opening modal
        if (event.target.matches('.status-select')) {
             event.stopPropagation();
             return;
        }

        verDetallesPedido(row.dataset.id);
    }
    
    function handlePedidosTableChange(event) {
        if (event.target.matches('.status-select')) {
            const pedidoId = event.target.closest('tr').dataset.id;
            cambiarEstadoPedido(pedidoId, event.target.value);
        }
    }

    function handleProductsTableActions(event) {
        const target = event.target;
        const id = target.dataset.id;
        if (!id) return;
        
        if (target.matches('.btn-edit')) {
            editarProducto(id);
        } else if (target.matches('.btn-danger')) {
            eliminarProducto(id);
        }
    }
    
    function handleCategoriesTableActions(event) {
        const target = event.target;
        const id = target.dataset.id;
        if (!id) return;
        
        if (target.matches('.btn-edit')) {
            editarCategoria(id);
        } else if (target.matches('.btn-danger')) {
            eliminarCategoria(id);
        }
    }

    // --- SUPABASE & API FUNCTIONS ---
    async function cargarConfiguracion() {
        if (!supabaseClient) return;
        try {
            const { data, error } = await supabaseClient.from('configuracion').select('clave, valor');
            if (error) console.warn('No se pudo cargar la configuración de la tienda:', error.message);
            if (data) {
                configuracion = data.reduce((acc, curr) => ({ ...acc, [curr.clave]: curr.valor }), {});
            }
            if (configuracion.hero_image_url) {
                heroSection.style.backgroundImage = `url('${configuracion.hero_image_url}')`;
            } else {
                heroSection.style.background = 'linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%)';
            }
        } catch (error) {
            console.error('Ocurrió un error al procesar la configuración:', error.message);
        }
    }

    async function cargarCategorias() {
        if (!supabaseClient) return;
        try {
            const { data, error } = await supabaseClient.from('categorias').select('*').order('nombre');
            if (error) console.warn("Advertencia al cargar categorías:", error.message);
            categorias = data || [];
        } catch (error) {
            console.error("Error inesperado al cargar categorías:", error.message);
            categorias = [];
        } finally {
            renderizarFiltrosCategorias();
            llenarSelectorCategoriasProducto();
        }
    }
    
    async function cargarProductos() {
        if (!supabaseClient) return;
        loadingProducts.style.display = 'block';
        try {
            const { data, error } = await supabaseClient.from('productos').select('*').eq('activo', true).order('nombre');
            if (error) throw error;
            
            const categoriesMap = new Map(categorias.map(cat => [cat.id, cat]));
            productos = (data || []).map(producto => ({
                ...producto,
                categorias: categoriesMap.get(producto.categoria_id) || { nombre: 'Sin Categoría', slug: 'sin-categoria' }
            }));
            renderizarProductos();
        } catch (error) {
            productsGrid.innerHTML = `<div class="empty-cart"><p>Error al cargar productos: ${error.message}</p></div>`;
            productos = [];
        } finally {
            loadingProducts.style.display = 'none';
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
        const email = document.getElementById('emailLogin').value;
        const password = document.getElementById('passwordLogin').value;
        const errorDiv = document.getElementById('loginError');
        errorDiv.style.display = 'none';
        
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            usuarioActual = data.user;
            mostrarPanelAdmin();
        } catch (error) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = 'Error al iniciar sesion: ' + error.message;
        }
    }
    
    async function cerrarSesion() {
        if (pedidosChannel) {
            supabaseClient.removeChannel(pedidosChannel);
            pedidosChannel = null;
        }
        await supabaseClient.auth.signOut();
        usuarioActual = null;
        loginSection.style.display = 'block';
        adminPanel.style.display = 'none';
        mostrarTienda();
    }

    async function geocodeDireccion(direccion) {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}`);
            if (!response.ok) throw new Error('Servicio de geocodificación no disponible');
            const data = await response.json();
            return (data && data.length > 0) ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
        } catch (error) {
            console.warn("No se pudo geocodificar la dirección:", error.message);
            return null;
        }
    }

    // --- UI & VIEW FUNCTIONS ---
    function mostrarTienda() {
        tiendaView.style.display = 'block';
        adminView.style.display = 'none';
    }

    function mostrarAdmin() {
        tiendaView.style.display = 'none';
        adminView.style.display = 'block';
        if (usuarioActual) {
            mostrarPanelAdmin();
        } else {
            loginSection.style.display = 'block';
            adminPanel.style.display = 'none';
        }
    }
    
    function mostrarPanelAdmin() {
        loginSection.style.display = 'none';
        adminPanel.style.display = 'block';
        adminEmail.textContent = usuarioActual.email;
        
        cargarPedidos();
        cargarProductosAdmin();
        cargarCategoriasAdmin();
        cargarConfiguracionAdmin();

        mostrarVistaAdmin('pedidos');
        suscribirACambiosPedidos();
    }

    function mostrarVistaAdmin(vista) {
        document.querySelectorAll('.admin-view-content').forEach(v => v.style.display = 'none');
        document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));

        document.getElementById(`${vista}View`).style.display = 'block';
        document.querySelector(`.admin-nav-btn[data-view="${vista}"]`).classList.add('active');
    }

    function renderizarFiltrosCategorias() {
        categoryFilter.innerHTML = `
            <button class="filter-btn ${'todos' === categoriaActual ? 'active' : ''}" data-slug="todos">Todos</button>
            ${categorias.map(cat => `
                <button class="filter-btn ${cat.slug === categoriaActual ? 'active' : ''}" data-slug="${cat.slug}">${cat.nombre}</button>
            `).join('')}`;
    }

    function renderizarProductos() {
        const productosFiltrados = categoriaActual === 'todos' ? productos : productos.filter(p => p.categorias.slug === categoriaActual);
        
        if (productosFiltrados.length === 0) {
            productsGrid.innerHTML = '<div class="empty-cart"><p>No hay productos en esta categoria.</p></div>';
            return;
        }

        productsGrid.innerHTML = productosFiltrados.map(p => `
            <div class="product-card">
                <div class="product-image">
                    ${p.imagen_url 
                        ? `<img src="${optimizarImagenUrl(p.imagen_url)}" alt="${p.nombre}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
                           <span style="display:none">${p.icon || '📦'}</span>`
                        : `<span>${p.icon || '📦'}</span>`
                    }
                    ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
                </div>
                <div class="product-info">
                    <div class="product-category">${p.categorias.nombre}</div>
                    <h3 class="product-name">${p.nombre}</h3>
                    <div class="product-brand">${p.marca}</div>
                    <p class="product-description">${p.descripcion}</p>
                    <div class="product-price">S/ ${parseFloat(p.precio).toFixed(2)}</div>
                    <button class="add-to-cart-btn" data-id="${p.id}">Agregar al Carrito</button>
                </div>
            </div>
        `).join('');
    }

    // --- CART LOGIC ---
    function agregarAlCarrito(productoId) {
        const producto = productos.find(p => p.id === productoId);
        const itemExistente = carrito.find(item => item.id === productoId);
        if (itemExistente) itemExistente.cantidad++;
        else carrito.push({ ...producto, cantidad: 1 });
        actualizarContadorCarrito();
        mostrarNotificacion('✅ Producto agregado al carrito', 'success');
    }

    function actualizarContadorCarrito() {
        cartCount.textContent = carrito.reduce((sum, item) => sum + item.cantidad, 0);
    }

    function abrirCarrito() {
        cartModal.style.display = 'block';
        renderizarCarrito();
    }

    function cerrarCarrito() {
        cartModal.style.display = 'none';
    }

    function renderizarCarrito() {
        const content = document.getElementById('cartContent');
        document.getElementById('successMessage').style.display = 'none';
        if (carrito.length === 0) {
            content.innerHTML = `<div class="empty-cart"><div class="empty-cart-icon">🛒</div><p>Tu carrito esta vacio</p></div>`;
            return;
        }
        const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
        content.innerHTML = `
            ${carrito.map((item, index) => `
                <div class="cart-item">
                    <div class="cart-item-icon">${item.icon || '📦'}</div>
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.nombre}</div>
                        <div class="cart-item-brand">${item.marca}</div>
                        <div class="cart-item-price">S/ ${parseFloat(item.precio).toFixed(2)} c/u</div>
                        <div class="cart-item-controls">
                            <button class="qty-btn" data-index="${index}" data-change="-1">-</button>
                            <span class="qty-display">${item.cantidad}</span>
                            <button class="qty-btn" data-index="${index}" data-change="1">+</button>
                            <button class="remove-btn" data-index="${index}">Eliminar</button>
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
            <form class="checkout-form">
                <div class="form-group"><label>Nombre Completo</label><input type="text" id="nombreCliente" required></div>
                <div class="form-group"><label>Telefono (sin prefijo +51)</label><input type="tel" id="telefonoCliente" required placeholder="905820448"></div>
                <div class="form-group"><label>Email (Opcional)</label><input type="email" id="emailCliente" placeholder="cliente@ejemplo.com"></div>
                <div class="form-group">
                    <label>Direccion de Entrega</label><textarea id="direccionCliente" required></textarea>
                </div>
                 <button type="button" class="btn-secondary" id="getLocationBtn" style="width:100%; margin-bottom: 1rem;">📍 Usar mi ubicación actual</button>
                <p id="locationStatus" class="form-hint" style="text-align:center; min-height: 1.2em;"></p>
                <input type="hidden" id="latitudCliente">
                <input type="hidden" id="longitudCliente">
                <button type="submit" class="btn-primary" id="btnRealizarPedido">Realizar Pedido</button>
            </form>`;
    }

    function cambiarCantidad(index, cambio) {
        carrito[index].cantidad += cambio;
        if (carrito[index].cantidad <= 0) carrito.splice(index, 1);
        actualizarContadorCarrito();
        renderizarCarrito();
    }

    function eliminarItem(index) {
        carrito.splice(index, 1);
        actualizarContadorCarrito();
        renderizarCarrito();
    }
    
    function obtenerUbicacionCliente(button) {
        const statusEl = document.getElementById('locationStatus');
        if (!navigator.geolocation) {
            statusEl.textContent = 'Geolocalización no es soportada por tu navegador.';
            statusEl.style.color = 'var(--danger)';
            return;
        }

        button.disabled = true;
        statusEl.textContent = 'Obteniendo ubicación...';
        statusEl.style.color = 'var(--text-light)';

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                document.getElementById('latitudCliente').value = lat;
                document.getElementById('longitudCliente').value = lon;
                statusEl.textContent = '✓ Ubicación obtenida con éxito.';
                statusEl.style.color = 'var(--success)';
                button.textContent = 'Ubicación Obtenida';
            },
            (error) => {
                let message = 'Error al obtener la ubicación: ';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        message += 'Permiso denegado.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        message += 'Información de ubicación no disponible.';
                        break;
                    case error.TIMEOUT:
                        message += 'La solicitud de ubicación ha caducado.';
                        break;
                    default:
                        message += 'Un error desconocido ha ocurrido.';
                        break;
                }
                statusEl.textContent = message;
                statusEl.style.color = 'var(--danger)';
                button.disabled = false;
            }
        );
    }
    
    async function realizarPedido(event) {
        event.preventDefault();
        const btnPedido = document.getElementById('btnRealizarPedido');
        btnPedido.disabled = true;
        btnPedido.textContent = 'Procesando pedido...';
        
        const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
        const direccion = document.getElementById('direccionCliente').value;
        const lat = document.getElementById('latitudCliente').value;
        const lon = document.getElementById('longitudCliente').value;
        
        let coords = null;
        if (lat && lon) {
            coords = { lat: parseFloat(lat), lon: parseFloat(lon) };
        } else {
            coords = await geocodeDireccion(direccion);
        }

        const pedidoData = {
            nombre_cliente: document.getElementById('nombreCliente').value,
            telefono_cliente: document.getElementById('telefonoCliente').value,
            email_cliente: document.getElementById('emailCliente').value || null,
            direccion: direccion,
            productos: carrito.map(item => ({
                id: item.id, nombre: item.nombre, marca: item.marca, cantidad: item.cantidad,
                precio_unitario: parseFloat(item.precio),
                subtotal: parseFloat(item.precio) * item.cantidad
            })),
            total: parseFloat(total),
            cantidad_items: carrito.reduce((sum, item) => sum + item.cantidad, 0),
            estado: 'pendiente_pago',
            latitud: coords ? coords.lat : null,
            longitud: coords ? coords.lon : null
        };
        
        try {
            const { error } = await supabaseClient.from('pedidos').insert([pedidoData]);
            if (error) throw error;
            document.getElementById('cartContent').style.display = 'none';
            document.getElementById('successMessage').style.display = 'block';
        } catch (error) {
            mostrarNotificacion('Error al realizar el pedido: ' + error.message, 'error');
            btnPedido.disabled = false;
            btnPedido.textContent = 'Realizar Pedido';
        }
    }

    function cerrarYLimpiar() {
        carrito = [];
        actualizarContadorCarrito();
        cerrarCarrito();
        document.getElementById('cartContent').style.display = 'block';
    }

    function filtrarCategoria(slug) {
        categoriaActual = slug;
        renderizarFiltrosCategorias();
        renderizarProductos();
    }
    
    // --- ADMIN FUNCTIONS ---
    function cargarConfiguracionAdmin() {
        document.getElementById('heroImageUrl').value = configuracion.hero_image_url || '';
    }

    async function guardarConfiguracion(event) {
        event.preventDefault();
        const btn = document.getElementById('btnGuardarConfig');
        btn.disabled = true;
        btn.textContent = 'Guardando...';
        try {
            const { error } = await supabaseClient
                .from('configuracion')
                .upsert({ clave: 'hero_image_url', valor: document.getElementById('heroImageUrl').value }, { onConflict: 'clave' });
            if (error) throw error;
            mostrarNotificacion('Configuración guardada exitosamente.', 'success');
            await cargarConfiguracion();
        } catch (error) {
            mostrarNotificacion('Error al guardar: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Guardar Cambios';
        }
    }

    async function cargarPedidos() {
        if (!supabaseClient) return;
        try {
            const { data, error } = await supabaseClient.from('pedidos').select('*').order('fecha_pedido', { ascending: false });
            if (error) throw error;
            pedidos = data || [];
            renderizarFiltroEstados();
            renderizarPedidos();
        } catch (error) {
            console.error("Error al cargar pedidos:", error.message);
        }
    }

    function renderizarFiltroEstados() {
        const container = document.getElementById('pedidosFilterContainer');
        const estados = ['todos', ...estadosPosibles];
        container.innerHTML = estados.map(e => `
            <button class="filter-btn ${e === estadoPedidoActual ? 'active' : ''}" data-estado="${e}">
                ${(e.charAt(0).toUpperCase() + e.slice(1)).replace(/_/g, ' ')}
            </button>
        `).join('');
    }

    function filtrarPedidosPorEstado(estado) {
        estadoPedidoActual = estado;
        renderizarFiltroEstados();
        renderizarPedidos();
    }

    function renderizarPedidos() {
        const pedidosFiltrados = estadoPedidoActual === 'todos' ? pedidos : pedidos.filter(p => p.estado === estadoPedidoActual);
        
        document.getElementById('kpiIngresos').textContent = `S/ ${pedidosFiltrados.reduce((s, p) => s + p.total, 0).toFixed(2)}`;
        document.getElementById('kpiTotalPedidos').textContent = pedidos.length;
        document.getElementById('kpiPendientes').textContent = pedidos.filter(p => ['pendiente_pago', 'pago_confirmado', 'en_preparacion'].includes(p.estado)).length;

        const tbody = document.getElementById('adminPedidosTable');
        if(pedidosFiltrados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">No hay pedidos con este estado.</td></tr>`;
            return;
        }
        tbody.innerHTML = pedidosFiltrados.map(p => `
            <tr data-id="${p.id}">
                <td>${p.numero_pedido || 'N/A'}</td>
                <td>${new Date(p.fecha_pedido).toLocaleDateString()}</td>
                <td>${p.nombre_cliente}</td>
                <td>S/ ${parseFloat(p.total).toFixed(2)}</td>
                <td>
                    <select class="status-select ${p.estado}">
                        ${estadosPosibles.map(e => `<option value="${e}" ${e === p.estado ? 'selected' : ''}>${e.replace(/_/g, ' ')}</option>`).join('')}
                    </select>
                </td>
            </tr>
        `).join('');
    }
    
    async function verDetallesPedido(pedidoId) {
        try {
            const { data: pedido, error } = await supabaseClient.from('pedidos').select('*').eq('id', pedidoId).single();
            if (error) throw error;
            
            const modalBody = document.getElementById('pedidoModalBody');
            modalBody.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; flex-wrap: wrap;">
                    <div><h4>Datos del Cliente</h4><p><strong>Nombre:</strong> ${pedido.nombre_cliente}</p><p><strong>Teléfono:</strong> ${pedido.telefono_cliente}</p><p><strong>Email:</strong> ${pedido.email_cliente || 'N/A'}</p><p><strong>Dirección:</strong> ${pedido.direccion}</p></div>
                    <div><h4>Resumen del Pedido</h4><p><strong>N° Pedido:</strong> ${pedido.numero_pedido || 'N/A'}</p><p><strong>Fecha:</strong> ${new Date(pedido.fecha_pedido).toLocaleString()}</p><p><strong>Total:</strong> S/ ${parseFloat(pedido.total).toFixed(2)}</p>
                        <div class="form-group" style="margin-top: 1rem;"><label style="color: var(--text-dark);">Cambiar Estado</label>
                        <select id="modalStatusSelect" class="status-select ${pedido.estado}">${estadosPosibles.map(e => `<option value="${e}" ${e === pedido.estado ? 'selected' : ''}>${e.replace(/_/g, ' ')}</option>`).join('')}</select></div>
                        ${pedido.latitud && pedido.longitud ? `
                            <button class="btn-secondary" id="showMapBtn" style="width: 100%; margin-top: 1rem;">Ver Ubicación en Mapa</button>
                            <button class="btn-primary" id="shareLocationBtn" style="width: 100%; margin-top: 0.5rem;">🔗 Compartir con Delivery</button>
                        ` : '<p style="margin-top: 1rem; color: var(--text-light);">Ubicación GPS no proporcionada.</p>'}
                    </div>
                </div>
                <h4 style="margin-top: 2rem; margin-bottom: 1rem;">Productos</h4>
                ${(pedido.productos || []).map(p => `<div class="cart-item" style="padding: 1rem;"><div class="cart-item-info"><div class="cart-item-name">${p.nombre} (x${p.cantidad})</div><div class="cart-item-brand">${p.marca}</div></div><div style="font-weight: 700; font-size: 1.1rem; color: var(--primary);">S/ ${parseFloat(p.subtotal).toFixed(2)}</div></div>`).join('')}`;
            
            document.getElementById('modalStatusSelect').addEventListener('change', (e) => cambiarEstadoPedido(pedido.id, e.target.value));
            if(pedido.latitud && pedido.longitud) {
                document.getElementById('showMapBtn').addEventListener('click', () => mostrarMapaPedido(pedido.latitud, pedido.longitud, pedido.nombre_cliente));
                document.getElementById('shareLocationBtn').addEventListener('click', () => compartirUbicacion(pedido));
            }
            pedidoModal.style.display = 'block';
        } catch (error) {
            mostrarNotificacion("Error al cargar detalles del pedido: " + error.message, 'error');
        }
    }

    async function compartirUbicacion(pedido) {
        if (!pedido.latitud || !pedido.longitud) {
            mostrarNotificacion("No hay coordenadas para compartir.", "error");
            return;
        }

        const url = `https://www.google.com/maps?q=${pedido.latitud},${pedido.longitud}`;
        const shareData = {
            title: `Ubicación de Entrega - Pedido #${pedido.numero_pedido}`,
            text: `Entrega para: ${pedido.nombre_cliente}\nDirección: ${pedido.direccion}\nVer en mapa:`,
            url: url,
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
                mostrarNotificacion('Ubicación compartida.', 'success');
            } else {
                throw new Error('Web Share API not supported');
            }
        } catch (err) {
            // Fallback to clipboard for desktop or unsupported browsers
            navigator.clipboard.writeText(url).then(() => {
                mostrarNotificacion('✅ Enlace de Google Maps copiado al portapapeles.', 'info');
            }).catch(e => {
                mostrarNotificacion('Error al copiar el enlace.', 'error');
            });
        }
    }

    function cerrarModalPedido() { pedidoModal.style.display = 'none'; }

    async function cambiarEstadoPedido(pedidoId, nuevoEstado) {
        try {
             const { error } = await supabaseClient.from('pedidos').update({ estado: nuevoEstado }).eq('id', pedidoId);
            if (error) throw error;
            mostrarNotificacion(`✅ Estado del pedido actualizado`, 'success');
            const pedidoIndex = pedidos.findIndex(p => p.id === parseInt(pedidoId, 10));
            if (pedidoIndex !== -1) pedidos[pedidoIndex].estado = nuevoEstado;
            renderizarPedidos();

            const modalSelect = document.getElementById('modalStatusSelect');
            if (modalSelect) {
                modalSelect.className = `status-select ${nuevoEstado}`;
                modalSelect.value = nuevoEstado;
            }
        } catch(error) {
            mostrarNotificacion("Error al actualizar el estado: " + error.message, 'error');
        }
    }
    
    function suscribirACambiosPedidos() {
        if (pedidosChannel) supabaseClient.removeChannel(pedidosChannel);
        pedidosChannel = supabaseClient.channel('pedidos-db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, payload => {
                const updatedPedido = payload.new;
                const index = pedidos.findIndex(p => p.id === updatedPedido.id);
                if (payload.eventType === 'INSERT') {
                    pedidos.unshift(updatedPedido);
                    mostrarNotificacion(`Nuevo pedido de ${updatedPedido.nombre_cliente}!`, 'info');
                } else if (payload.eventType === 'UPDATE') {
                     if (index !== -1) {
                        pedidos[index] = { ...pedidos[index], ...updatedPedido };
                    }
                } else if (payload.eventType === 'DELETE') {
                    pedidos = pedidos.filter(p => p.id !== payload.old.id);
                }
                
                renderizarPedidos();
                const row = document.querySelector(`tr[data-id="${updatedPedido.id}"]`);
                if (row && payload.eventType !== 'DELETE') {
                    row.classList.add('row-updated');
                    setTimeout(() => row.classList.remove('row-updated'), 3000);
                }
            })
            .subscribe(status => {
                if (status === 'SUBSCRIBED') console.log('Conectado a cambios en tiempo real para pedidos.');
            });
    }

    function mostrarMapaPedido(lat, lon, cliente) {
        mapModal.style.display = 'block';
        setTimeout(() => {
            if (mapa) mapa.remove();
            mapa = L.map('mapa').setView([lat, lon], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
            L.marker([lat, lon]).addTo(mapa).bindPopup(`<b>Entrega para:</b><br>${cliente}`).openPopup();
        }, 100);
    }

    function cerrarModalMapa() {
        mapModal.style.display = 'none';
        if (mapa) {
            mapa.remove();
            mapa = null;
        }
    }

    async function cargarProductosAdmin() {
        if (!supabaseClient) return;
        document.getElementById('loadingAdmin').style.display = 'block';
        try {
            const { data, error } = await supabaseClient.from('productos').select('*').order('nombre');
            if (error) throw error;
            
            const categoriesMap = new Map(categorias.map(cat => [cat.id, cat]));
            const productosAdmin = (data || []).map(p => ({ ...p, categorias: categoriesMap.get(p.categoria_id) || null }));
            const tbody = document.getElementById('adminProductsTable');
            tbody.innerHTML = productosAdmin.map(p => `
                <tr>
                    <td>${p.imagen_url ? `<img src="${p.imagen_url}" alt="${p.nombre}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;" onerror="this.style.display='none'">` : ''}</td>
                    <td style="font-size: 1.5rem;">${p.icon || '📦'}</td>
                    <td>${p.nombre}</td>
                    <td>${p.marca}</td>
                    <td>${p.categorias ? p.categorias.nombre : 'Sin categoría'}</td>
                    <td>S/ ${parseFloat(p.precio).toFixed(2)}</td>
                    <td>${p.activo ? 'Activo' : 'Inactivo'}</td>
                    <td class="table-actions">
                        <button class="btn-edit" data-id="${p.id}">Editar</button>
                        <button class="btn-danger" data-id="${p.id}">Eliminar</button>
                    </td>
                </tr>`).join('');
        } catch (error) {
            mostrarNotificacion('Error al cargar productos: ' + error.message, 'error');
        } finally {
            document.getElementById('loadingAdmin').style.display = 'none';
        }
    }
    
    async function cargarCategoriasAdmin() {
        if(!supabaseClient) return;
        try {
            const { data, error } = await supabaseClient.from('categorias').select('*').order('nombre');
            if (error) throw error;
            const tbody = document.getElementById('adminCategoriesTable');
            tbody.innerHTML = (data || []).map(cat => `
                <tr>
                    <td>${cat.nombre}</td>
                    <td>${cat.slug}</td>
                    <td class="table-actions">
                        <button class="btn-edit" data-id="${cat.id}">Editar</button>
                        <button class="btn-danger" data-id="${cat.id}">Eliminar</button>
                    </td>
                </tr>`).join('');
        } catch (error) {
            mostrarNotificacion('Error al cargar categorías: ' + error.message, 'error');
        }
    }

    function abrirModalCategoria() {
        document.getElementById('categoriaModalTitle').textContent = 'Agregar Categoría';
        categoriaForm.reset();
        document.getElementById('categoriaId').value = '';
        categoriaModal.style.display = 'block';
    }

    function cerrarModalCategoria() {
        categoriaModal.style.display = 'none';
    }

    async function editarCategoria(id) {
        try {
            const { data, error } = await supabaseClient.from('categorias').select('*').eq('id', id).single();
            if (error) throw error;
            document.getElementById('categoriaModalTitle').textContent = 'Editar Categoría';
            document.getElementById('categoriaId').value = data.id;
            document.getElementById('categoriaNombre').value = data.nombre;
            document.getElementById('categoriaSlug').value = data.slug;
            categoriaModal.style.display = 'block';
        } catch (error) {
            mostrarNotificacion('Error al cargar categoría: ' + error.message, 'error');
        }
    }

    async function guardarCategoria(event) {
        event.preventDefault();
        const id = document.getElementById('categoriaId').value;
        const categoriaData = {
            nombre: document.getElementById('categoriaNombre').value,
            slug: document.getElementById('categoriaSlug').value,
        };

        try {
            const { error } = id 
                ? await supabaseClient.from('categorias').update(categoriaData).eq('id', id)
                : await supabaseClient.from('categorias').insert([categoriaData]);
            if (error) throw error;
            
            mostrarNotificacion(`✅ Categoría ${id ? 'actualizada' : 'creada'}`, 'success');
            cerrarModalCategoria();
            await cargarCategorias();
            cargarCategoriasAdmin();
        } catch (error) {
            mostrarNotificacion('Error al guardar categoría: ' + error.message, 'error');
        }
    }

    async function eliminarCategoria(id) {
        if (!confirm('¿Estás seguro? La eliminación fallará si hay productos en esta categoría.')) return;
        try {
            const { error } = await supabaseClient.from('categorias').delete().eq('id', id);
            if (error) throw error;
            mostrarNotificacion('🗑️ Categoría eliminada', 'info');
            await cargarCategorias();
            cargarCategoriasAdmin();
        } catch (error) {
            mostrarNotificacion('Error al eliminar categoría: ' + error.message, 'error');
        }
    }

    function generarSlug(text) {
        const slug = text.toString().toLowerCase()
            .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-').replace(/^-+/, '').replace(/-+$/, ''); 
        document.getElementById('categoriaSlug').value = slug;
    }

    function llenarSelectorCategoriasProducto() {
        const select = document.getElementById('productoCategoria');
        if (!select) return;
        select.innerHTML = categorias.length > 0 
            ? categorias.map(cat => `<option value="${cat.id}">${cat.nombre}</option>`).join('')
            : '<option value="">Crea una categoría primero</option>';
    }

    async function abrirModalProducto() {
        document.getElementById('productoModalTitle').textContent = 'Agregar Producto';
        productoForm.reset();
        document.getElementById('productoId').value = '';
        document.getElementById('productoActivo').checked = true;
        document.getElementById('imagePreview').innerHTML = '<span class="image-preview-text">🖼️</span>';
        llenarSelectorCategoriasProducto();
        productoModal.style.display = 'block';
    }

    function cerrarModalProducto() {
        productoModal.style.display = 'none';
    }

    async function editarProducto(id) {
        try {
            const { data, error } = await supabaseClient.from('productos').select('*').eq('id', id).single();
            if (error) throw error;
            document.getElementById('productoModalTitle').textContent = 'Editar Producto';
            document.getElementById('productoId').value = data.id;
            document.getElementById('productoNombre').value = data.nombre;
            document.getElementById('productoMarca').value = data.marca;
            document.getElementById('productoDescripcion').value = data.descripcion;
            document.getElementById('productoPrecio').value = data.precio;
            document.getElementById('productoIcon').value = data.icon || '';
            document.getElementById('productoBadge').value = data.badge || '';
            document.getElementById('productoActivo').checked = data.activo;
            document.getElementById('productoImagen').value = data.imagen_url || '';
            
            llenarSelectorCategoriasProducto();
            document.getElementById('productoCategoria').value = data.categoria_id;

            previewImagen();
            productoModal.style.display = 'block';
        } catch (error) {
            mostrarNotificacion('Error al cargar producto: ' + error.message, 'error');
        }
    }

    async function guardarProducto(event) {
        event.preventDefault();
        const id = document.getElementById('productoId').value;
        const productoData = {
            nombre: document.getElementById('productoNombre').value,
            marca: document.getElementById('productoMarca').value,
            categoria_id: parseInt(document.getElementById('productoCategoria').value),
            descripcion: document.getElementById('productoDescripcion').value,
            precio: parseFloat(document.getElementById('productoPrecio').value),
            icon: document.getElementById('productoIcon').value || '📦',
            badge: document.getElementById('productoBadge').value || null,
            activo: document.getElementById('productoActivo').checked,
            imagen_url: document.getElementById('productoImagen').value || null
        };

        try {
            const { error } = id 
                ? await supabaseClient.from('productos').update(productoData).eq('id', id)
                : await supabaseClient.from('productos').insert([productoData]);
            if (error) throw error;
            mostrarNotificacion(`✅ Producto ${id ? 'actualizado' : 'creado'}`, 'success');
            cerrarModalProducto();
            await cargarProductosAdmin();
            await cargarProductos();
        } catch (error) {
            mostrarNotificacion('Error al guardar producto: ' + error.message, 'error');
        }
    }

    async function eliminarProducto(id) {
        if (!confirm('Estas seguro de eliminar este producto?')) return;
        try {
            const { error } = await supabaseClient.from('productos').delete().eq('id', id);
            if (error) throw error;
            mostrarNotificacion('🗑️ Producto eliminado', 'info');
            await cargarProductosAdmin();
            await cargarProductos();
        } catch (error) {
            mostrarNotificacion('Error al eliminar producto: ' + error.message, 'error');
        }
    }

    // --- UTILITY FUNCTIONS ---
    function previewImagen() {
        const url = document.getElementById('productoImagen').value;
        const preview = document.getElementById('imagePreview');
        preview.innerHTML = url 
            ? `<img src="${optimizarImagenUrl(url)}" alt="Preview" onerror="this.style.display='none'; this.parentElement.innerHTML='<span class=\\'image-preview-text\\'>❌</span>'">`
            : '<span class="image-preview-text">🖼️</span>';
    }

    async function subirImagenCloudinary(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return mostrarNotificacion('Por favor selecciona un archivo de imagen válido', 'error');
        if (file.size > 10 * 1024 * 1024) return mostrarNotificacion('La imagen es demasiado grande. Máximo 10MB', 'error');

        const progressBar = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('uploadProgressBar');
        progressBar.style.display = 'block';
        progressFill.style.width = '0%';

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);
            formData.append('folder', 'red51/productos');
            
            const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
            if (!response.ok) throw new Error('Error al subir la imagen');
            const data = await response.json();
            
            document.getElementById('productoImagen').value = data.secure_url;
            previewImagen();
            
            mostrarNotificacion('🖼️ Imagen subida', 'success');
        } catch (error) {
            mostrarNotificacion('Error al subir la imagen. Por favor intenta nuevamente.', 'error');
        } finally {
            progressBar.style.display = 'none';
            event.target.value = ''; // Reset file input
        }
    }

    function optimizarImagenUrl(url) {
        if (url && url.includes('res.cloudinary.com') && !url.includes('/upload/c_')) {
            const parts = url.split('/upload/');
            return parts.length === 2 ? `${parts[0]}/upload/c_fill,g_auto,q_auto,f_auto,w_600,h_450/${parts[1]}` : url;
        }
        return url;
    }

    function descargarPlantilla() {
        const csvContent = `nombre,marca,categoria_id,descripcion,precio,icon,badge,imagen_url,activo\niPhone 15 Pro,Apple,1,Smartphone premium,4599.00,📱,Nuevo,https://ejemplo.com/iphone15.jpg,true`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'plantilla_productos_red51.csv';
        link.click();
        URL.revokeObjectURL(link.href);
        mostrarNotificacion('📥 Plantilla CSV descargada.', 'info');
    }

    async function importarProductos(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const lines = e.target.result.split('\n');
                const headers = lines[0].split(',').map(h => h.trim());
                const productosImportados = lines.slice(1).map(line => {
                    if (!line.trim()) return null;
                    const values = line.split(',').map(v => v.trim());
                    const producto = {};
                    headers.forEach((h, i) => producto[h] = values[i] || null);
                    // Type coercion
                    ['categoria_id', 'precio'].forEach(key => producto[key] = parseFloat(producto[key]));
                    producto['activo'] = producto['activo']?.toLowerCase() === 'true';
                    return producto;
                }).filter(p => p && p.nombre && p.categoria_id && p.precio);
                
                if (productosImportados.length === 0) return mostrarNotificacion('No se encontraron productos válidos en el CSV', 'error');
                if (!confirm(`Se importarán ${productosImportados.length} productos. ¿Continuar?`)) return;
                
                document.getElementById('loadingAdmin').style.display = 'block';
                const { error } = await supabaseClient.from('productos').insert(productosImportados);
                if (error) throw error;
                
                mostrarNotificacion(`✅ ${productosImportados.length} productos importados`, 'success');
                await cargarProductosAdmin();
                await cargarProductos();
            } catch (error) {
                mostrarNotificacion('Error al importar productos: ' + error.message, 'error');
            } finally {
                document.getElementById('loadingAdmin').style.display = 'none';
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    function mostrarNotificacion(mensaje, tipo = 'info') { // 'info', 'success', 'error'
        const notif = document.createElement('div');
        notif.textContent = mensaje;
        notif.className = `notification ${tipo}`;
        
        if (!document.getElementById('notif-style')) {
            const style = document.createElement('style');
            style.id = 'notif-style';
            style.innerHTML = `@keyframes fadeInOut { 0% { opacity: 0; transform: translateY(-20px); } 10% { opacity: 1; transform: translateY(0); } 90% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-20px); } }`;
            document.head.appendChild(style);
        }
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 3000);
    }
    
    // --- START THE APP ---
    inicializarApp();
});