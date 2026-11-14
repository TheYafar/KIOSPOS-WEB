package com.kioskpos.web.demo;

import com.kioskpos.web.Fechas;
import com.kioskpos.web.auth.CajaService;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.UsuarioService;
import com.kioskpos.web.auth.security.JwtService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cliente.ClienteService;
import com.kioskpos.web.compra.CompraService;
import com.kioskpos.web.cuadre.CuadreService;
import com.kioskpos.web.inventario.InventarioService;
import com.kioskpos.web.inventario.InventarioService.DatosProducto;
import com.kioskpos.web.inventario.PresentacionService;
import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.permiso.PermisoService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.seguridad.LimitePorIp;
import com.kioskpos.web.tasa.TasaNegocioService;
import com.kioskpos.web.tenant.NegocioContext;
import com.kioskpos.web.venta.MetodoPago;
import com.kioskpos.web.venta.Moneda;
import com.kioskpos.web.venta.VentaService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * "Probar la demo": cada visitante recibe SU PROPIA bodega de muestra (un negocio marcado
 * {@code es_demo}, aislado por RLS como cualquiera), ya llena: productos con categorías y
 * bloques, una caja con turno abierto y su cajera, ventas del día, clientes con crédito y una
 * factura de proveedor por pagar. Así nadie le daña la demo al siguiente.
 *
 * Las sesiones de la demo duran 24 h (no hay contraseña conocida: al vencer, la demo muere).
 * Límites: por IP por hora y un tope diario global. Se apaga con {@code kioskpos.demo.abierta}.
 */
@Service
public class DemoService {

    private final NegocioRegistroService registro;
    private final NegocioRepository negocios;
    private final CajaService cajas;
    private final UsuarioService usuarios;
    private final InventarioService inventario;
    private final PresentacionService presentaciones;
    private final ClienteService clientes;
    private final CompraService compras;
    private final CuadreService cuadre;
    private final PermisoService permisos;
    private final VentaService ventas;
    private final TasaNegocioService tasas;
    private final JwtService jwt;
    private final boolean abierta;
    private final int maxPorDia;
    private final LimitePorIp limite;

    public DemoService(NegocioRegistroService registro, NegocioRepository negocios, CajaService cajas,
                       UsuarioService usuarios, InventarioService inventario, PresentacionService presentaciones,
                       ClienteService clientes, CompraService compras, CuadreService cuadre, PermisoService permisos,
                       VentaService ventas, TasaNegocioService tasas, JwtService jwt,
                       @Value("${kioskpos.demo.abierta:true}") boolean abierta,
                       @Value("${kioskpos.demo.max-por-hora:10}") int maxPorHora,
                       @Value("${kioskpos.demo.max-por-dia:300}") int maxPorDia) {
        this.registro = registro;
        this.negocios = negocios;
        this.cajas = cajas;
        this.usuarios = usuarios;
        this.inventario = inventario;
        this.presentaciones = presentaciones;
        this.clientes = clientes;
        this.compras = compras;
        this.cuadre = cuadre;
        this.permisos = permisos;
        this.ventas = ventas;
        this.tasas = tasas;
        this.jwt = jwt;
        this.abierta = abierta;
        this.maxPorDia = maxPorDia;
        this.limite = new LimitePorIp(maxPorHora, Duration.ofHours(1),
                "Ya abriste varias demos desde esta conexión. Intenta más tarde o crea tu cuenta gratis.");
    }

    public static final Duration DURACION = Duration.ofHours(24);

    public boolean abierta() {
        return abierta;
    }

    public record Sesion(String token, Long usuarioId, String nombreCompleto, RolUsuario rol, Long negocioId, Long cajaId) {
    }

    /** Las dos formas de mirar la demo: como dueño (reportes, inventario…) y como cajera (vender). */
    public record DemoCreada(Sesion dueno, Sesion cajero, String pinCajero, Instant expira) {
    }

    public DemoCreada crear(String ip) {
        if (!abierta) {
            throw new IllegalStateException("La demo no está disponible ahora. Crea tu cuenta gratis para probar.");
        }
        if (negocios.countByEsDemoTrueAndCreatedAtAfter(Instant.now().minus(Duration.ofDays(1))) >= maxPorDia) {
            throw new IllegalStateException("La demo está muy solicitada hoy. Crea tu cuenta gratis: tienes 7 días para probar.");
        }
        limite.contar(ip);

        String email = "demo-" + UUID.randomUUID() + "@demo.kioskpos";
        NegocioRegistroService.NegocioCreado creado = registro.registrarNegocioConDueno(
                "Bodega La Esquina", "Visitante", email, UUID.randomUUID().toString());
        Long neg = creado.negocioId();
        Negocio n = negocios.findById(neg).orElseThrow();
        n.setEsDemo(true);
        n.setEnPrueba(true);
        n.setPagoHasta(Fechas.hoy().plusDays(1));
        n.setTelefono("0412-0000000");
        n.setDireccion("Av. Principal, Caracas");
        n.setRif("J-00000000-0");
        n.setMensajeTicket("¡GRACIAS POR SU COMPRA!");
        n.setCajasContratadas(1);
        n = negocios.save(n);
        BigDecimal tasa = tasas.efectiva(n);
        if (tasa == null || tasa.signum() <= 0) {
            tasa = new BigDecimal("40");
        }

        try {
            NegocioContext.set(neg);
            KioskPrincipal dueno = new KioskPrincipal(creado.duenoId(), neg, RolUsuario.DUENO, null);
            Long cajaId = cajas.registrar("Caja principal", null).caja().getId();
            Long anaId = usuarios.crearCajero("Ana", "1234").getId();
            usuarios.crearCajero("Luis", "5678");
            KioskPrincipal ana = new KioskPrincipal(anaId, neg, RolUsuario.CAJERO, cajaId);

            Map<String, Producto> p = sembrarProductos();
            presentaciones.guardar(p.get("cig").getId(), List.of(
                    new PresentacionService.PresentacionInput("Caja", new BigDecimal("20"), new BigDecimal("5.00"), null),
                    new PresentacionService.PresentacionInput("Media caja", new BigDecimal("10"), new BigDecimal("2.60"), null)));

            Long maria = clientes.crear(new ClienteService.Datos("María Pérez", "V-14523887", "04145551234",
                    new BigDecimal("30"), true)).id();
            clientes.crear(new ClienteService.Datos("José Rojas", null, "04241112233", BigDecimal.ZERO, true));

            Long polar = compras.guardarProveedor(null, new CompraService.DatosProveedor(
                    "Distribuidora Polar", "J-00041312-0", "0212-2023111", "Luis (vendedor)", null)).getId();
            var compra = compras.registrar(dueno, new CompraService.NuevaCompra(polar, "A-001458",
                    Fechas.hoy().minusDays(3), Fechas.hoy().plusDays(4), tasa, false, null, List.of(
                    new CompraService.ItemCompra(p.get("harina").getId(), new BigDecimal("24"), new BigDecimal("0.80"), null),
                    new CompraService.ItemCompra(p.get("malta").getId(), new BigDecimal("48"), new BigDecimal("0.55"), null))));
            compras.abonar(dueno, compra.compra().getId(), new BigDecimal("20"), "PAGO_MOVIL", null);

            cuadre.abrir(cajaId, anaId, new BigDecimal("20"), new BigDecimal("2000"));
            String permiso = permisos.renovar(neg, cajaId).permiso();
            sembrarVentas(ana, permiso, tasa, p, maria);

            return new DemoCreada(
                    sesion(dueno, "Visitante"),
                    sesion(ana, "Ana"),
                    "1234",
                    Instant.now().plus(DURACION));
        } finally {
            NegocioContext.clear();
        }
    }

    private Sesion sesion(KioskPrincipal p, String nombre) {
        return new Sesion(jwt.emitir(p, DURACION), p.usuarioId(), nombre, p.rol(), p.negocioId(), p.cajaId());
    }

    private Map<String, Producto> sembrarProductos() {
        Map<String, Producto> m = new HashMap<>();
        // clave, código, nombre, precio $, costo $, categoría, stock, mínimo, pesable, unidad
        Object[][] filas = {
                {"harina", "7591002000011", "Harina PAN 1 kg", "1.10", "0.80", "Víveres", "40", "10", false, "UND"},
                {"arroz", "7591014000012", "Arroz Mary 1 kg", "1.20", "0.85", "Víveres", "30", "10", false, "UND"},
                {"pasta", "7591030000013", "Pasta Primor 1 kg", "1.30", "0.90", "Víveres", "25", "8", false, "UND"},
                {"aceite", "7591020000014", "Aceite Diana 1 L", "3.20", "2.40", "Víveres", "4", "6", false, "UND"},
                {"azucar", "7591040000015", "Azúcar Montalbán 1 kg", "1.40", "1.00", "Víveres", "0", "5", false, "UND"},
                {"cafe", "7591050000016", "Café Fama de América 250 g", "2.90", "2.10", "Víveres", "12", "4", false, "UND"},
                {"coca", "7590006000017", "Coca-Cola 2 L", "2.50", "1.80", "Bebidas", "18", "6", false, "UND"},
                {"malta", "7591016000018", "Malta Polar 355 ml", "0.90", "0.60", "Bebidas", "20", "12", false, "UND"},
                {"agua", "7591060000019", "Agua Minalba 1,5 L", "1.00", "0.65", "Bebidas", "20", "6", false, "UND"},
                {"queso", "2000001000010", "Queso blanco duro", "6.50", "4.80", "Charcutería", "5", "2", true, "KG"},
                {"jamon", "2000002000017", "Jamón de pierna", "9.00", "6.80", "Charcutería", "3", "1", true, "KG"},
                {"pan", "2000003000014", "Pan campesino", "1.50", "1.00", "Panadería", "10", "4", false, "UND"},
                {"cig", "7591070000010", "Cigarros Belmont (unidad)", "0.30", "0.20", "Chucherías", "200", "40", false, "UND"},
                {"chupeta", "7591080000011", "Chupeta Bon Bon Bum", "0.15", "0.08", "Chucherías", "100", "20", false, "UND"},
                {"jabon", "7591090000012", "Jabón Las Llaves", "1.10", "0.75", "Limpieza", "15", "5", false, "UND"},
                {"cloro", "7591100000013", "Cloro Nevex 1 L", "1.60", "1.10", "Limpieza", "2", "4", false, "UND"},
        };
        for (Object[] f : filas) {
            Producto pr = inventario.crear(new DatosProducto((String) f[1], (String) f[2], new BigDecimal((String) f[3]),
                    new BigDecimal((String) f[4]), (String) f[5], new BigDecimal((String) f[6]), (Boolean) f[8],
                    (String) f[9], new BigDecimal((String) f[7])));
            m.put((String) f[0], pr);
        }
        return m;
    }

    /** Ventas de muestra del día. Se registran como "de la cola" (cobradas hace 15 min): ya pasaron. */
    private void sembrarVentas(KioskPrincipal caja, String permiso, BigDecimal tasa, Map<String, Producto> p, Long maria) {
        long hace = Instant.now().minus(Duration.ofMinutes(15)).toEpochMilli();
        vender(caja, permiso, tasa, hace, null, MetodoPago.EFECTIVO_USD, p, "harina", "2", "coca", "1");
        vender(caja, permiso, tasa, hace, null, MetodoPago.PAGO_MOVIL, p, "arroz", "2", "pasta", "1", "aceite", "1");
        vender(caja, permiso, tasa, hace, null, MetodoPago.PUNTO, p, "queso", "0.5", "pan", "2");
        vender(caja, permiso, tasa, hace, null, MetodoPago.EFECTIVO_BS, p, "malta", "6", "chupeta", "4");
        vender(caja, permiso, tasa, hace, null, MetodoPago.PAGO_MOVIL, p, "cafe", "1", "harina", "3", "jabon", "1");
        vender(caja, permiso, tasa, hace, null, MetodoPago.BIOPAGO, p, "jamon", "0.25", "agua", "2");
        vender(caja, permiso, tasa, hace, maria, MetodoPago.FIADO, p, "harina", "2", "arroz", "2", "cafe", "1");
    }

    private void vender(KioskPrincipal caja, String permiso, BigDecimal tasa, long creadoAt, Long clienteId,
                        MetodoPago metodo, Map<String, Producto> p, String... claveCant) {
        List<VentaService.ItemInput> items = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (int i = 0; i < claveCant.length; i += 2) {
            Producto pr = p.get(claveCant[i]);
            BigDecimal cant = new BigDecimal(claveCant[i + 1]);
            items.add(new VentaService.ItemInput(pr.getId(), cant, pr.getPrecioUsd(), pr.getNombre()));
            total = total.add(pr.getPrecioUsd().multiply(cant).setScale(2, RoundingMode.HALF_UP));
        }
        boolean enUsd = metodo == MetodoPago.EFECTIVO_USD || metodo == MetodoPago.FIADO;
        BigDecimal monto = enUsd ? total : total.multiply(tasa).setScale(2, RoundingMode.UP);
        ventas.registrar(caja, permiso, new VentaService.VentaInput(UUID.randomUUID().toString(), tasa, items,
                List.of(new VentaService.PagoInput(metodo, enUsd ? Moneda.USD : Moneda.VES, monto, null)),
                creadoAt, clienteId));
    }
}
