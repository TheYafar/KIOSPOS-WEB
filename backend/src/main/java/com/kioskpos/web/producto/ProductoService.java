package com.kioskpos.web.producto;

import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProductoService {

    private final ProductoRepository productoRepository;

    public ProductoService(ProductoRepository productoRepository) {
        this.productoRepository = productoRepository;
    }

    @Transactional
    public Producto crear(CrearProductoRequest request) {
        Long negocioId = NegocioContext.require();

        Producto producto = new Producto();
        producto.setNegocioId(negocioId);
        producto.setCodigoBarras(request.codigoBarras());
        producto.setNombre(request.nombre());
        producto.setPrecioUsd(request.precioUsd());
        producto.setStockActual(BigDecimal.ZERO);
        producto.setActivo(true);
        return productoRepository.save(producto);
    }
}
