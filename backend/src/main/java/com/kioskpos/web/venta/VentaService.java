package com.kioskpos.web.venta;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.permiso.PermisoService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Procesa una venta. El servidor es la autoridad (CLAUDE.md §2): recalcula los montos
 * con SUS precios, baja el stock de forma atómica, numera la factura por caja y exige
 * un permiso de cobro vigente (kill switch). Reenvíos con el mismo codigo_unico no
 * cobran dos veces (idempotencia para la cola offline).
 *
 * Portado de VentaService del escritorio, recortado a P1: sin turno/cuadre (Paso 7),
 * sin fiado/avances/recargas (P2), sin descuento ni redondeo todavía.
 */
@Service
public class VentaService {

    private final VentaRepository ventaRepository;
    private final ProductoRepository productoRepository;
    private final PermisoService permisoService;

    public VentaService(VentaRepository ventaRepository,
                        ProductoRepository productoRepository,
                        PermisoService permisoService) {
        this.ventaRepository = ventaRepository;
        this.productoRepository = productoRepository;
        this.permisoService = permisoService;
    }

    public record ItemInput(Long productoId, BigDecimal cantidad, BigDecimal precioUsd, String nombre) {
    }

    public record PagoInput(MetodoPago metodo, Moneda moneda, BigDecimal montoOriginal, String referencia) {
    }

    public record VentaInput(String codigoUnico, BigDecimal tasaBcv,
                             List<ItemInput> items, List<PagoInput> pagos) {
    }

    @Transactional
    public Venta registrar(KioskPrincipal principal, String permisoToken, VentaInput input) {
        // 1. Kill switch: sin permiso vigente no se cobra.
        permisoService.exigirPermisoVigente(permisoToken, principal.negocioId(), principal.cajaId());

        // 2. Idempotencia: un reenvío con el mismo código no cobra dos veces.
        if (input.codigoUnico() != null && !input.codigoUnico().isBlank()) {
            var existente = ventaRepository.findByCodigoUnico(input.codigoUnico());
            if (existente.isPresent()) {
                return existente.get();
            }
        }
        if (input.items() == null || input.items().isEmpty()) {
            throw new IllegalArgumentException("La venta no tiene productos");
        }
        BigDecimal tasa = input.tasaBcv();
        if (tasa == null || tasa.signum() <= 0) {
            throw new IllegalArgumentException("La tasa del día debe ser mayor a 0");
        }

        Venta venta = new Venta();
        venta.setNegocioId(principal.negocioId());
        venta.setCajaId(principal.cajaId());
        venta.setUsuarioId(principal.usuarioId());
        venta.setCodigoUnico(input.codigoUnico());
        venta.setTasaBcv(tasa);

        // 3. Líneas: el servidor pone el precio (autoridad), salvo el cobro rápido (por monto).
        BigDecimal totalUsd = BigDecimal.ZERO;
        for (ItemInput item : input.items()) {
            BigDecimal cantidad = item.cantidad();
            if (cantidad == null || cantidad.signum() <= 0) {
                throw new IllegalArgumentException("Cantidad inválida");
            }
            DetalleVenta d = new DetalleVenta();
            d.setCantidad(cantidad);

            if (item.productoId() != null) {
                Producto producto = productoRepository.findById(item.productoId())
                        .orElseThrow(() -> new IllegalArgumentException("Producto no encontrado"));
                if (!producto.isActivo()) {
                    throw new IllegalArgumentException("El producto '" + producto.getNombre() + "' está inactivo");
                }
                int filas = productoRepository.descontarStock(producto.getId(), cantidad);
                if (filas == 0) {
                    throw new IllegalStateException("Stock insuficiente de '" + producto.getNombre() + "'");
                }
                d.setProductoId(producto.getId());
                d.setNombre(producto.getNombre());
                d.setPrecioUnitarioUsd(producto.getPrecioUsd());
            } else {
                // Cobro rápido: artículo sin catálogo, cobrado por monto.
                if (item.precioUsd() == null || item.precioUsd().signum() <= 0) {
                    throw new IllegalArgumentException("El cobro rápido necesita un monto mayor a 0");
                }
                if (item.nombre() == null || item.nombre().isBlank()) {
                    throw new IllegalArgumentException("El cobro rápido necesita un nombre");
                }
                d.setProductoId(null);
                d.setNombre(item.nombre().trim());
                d.setPrecioUnitarioUsd(item.precioUsd().setScale(2, RoundingMode.HALF_UP));
            }

            BigDecimal subtotal = d.getPrecioUnitarioUsd().multiply(cantidad).setScale(2, RoundingMode.HALF_UP);
            d.setSubtotalUsd(subtotal);
            totalUsd = totalUsd.add(subtotal);
            venta.addDetalle(d);
        }

        totalUsd = totalUsd.setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalBs = totalUsd.multiply(tasa).setScale(2, RoundingMode.HALF_UP);
        venta.setTotalUsd(totalUsd);
        venta.setTotalBs(totalBs);

        // 4. Pagos: validar que cubren el total y calcular el vuelto.
        List<CobroCalculadora.Pago> pagosCobro = new ArrayList<>();
        for (PagoInput p : (input.pagos() == null ? List.<PagoInput>of() : input.pagos())) {
            pagosCobro.add(new CobroCalculadora.Pago(p.moneda(), p.montoOriginal()));
        }
        CobroCalculadora.Resultado cobro = CobroCalculadora.calcular(totalUsd, tasa, pagosCobro);
        if (!cobro.cubre()) {
            throw new IllegalArgumentException(String.format(
                    "Pago insuficiente. Falta cubrir el total de $%.2f (Bs. %.2f)", totalUsd, totalBs));
        }
        venta.setVueltoUsd(cobro.vueltoUsd());
        venta.setVueltoBs(cobro.vueltoBs());

        for (PagoInput p : input.pagos()) {
            PagoVenta pago = new PagoVenta();
            pago.setMetodo(p.metodo());
            pago.setMoneda(p.moneda());
            BigDecimal monto = p.montoOriginal().setScale(2, RoundingMode.HALF_UP);
            pago.setMontoOriginal(monto);
            pago.setEquivalenteUsd(p.moneda() == Moneda.USD
                    ? monto
                    : monto.divide(tasa, 2, RoundingMode.HALF_UP));
            pago.setReferencia(p.referencia());
            venta.addPago(pago);
        }

        // 5. Número de factura correlativo POR CAJA.
        venta.setNumeroFactura(ventaRepository.maxNumeroFacturaDeCaja(principal.cajaId()) + 1);

        return ventaRepository.save(venta);
    }

    @Transactional(readOnly = true)
    public Venta buscar(Long id) {
        Venta v = ventaRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Venta no encontrada"));
        v.getDetalles().size();
        v.getPagos().size();
        return v;
    }

    @Transactional(readOnly = true)
    public List<Venta> ventasDeCaja(Long cajaId) {
        return ventaRepository.findByCajaIdOrderByFechaHoraDesc(cajaId);
    }
}
