package com.kioskpos.web.cliente;

import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.Usuario;
import com.kioskpos.web.auth.UsuarioRepository;
import com.kioskpos.web.tenant.NegocioContext;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * El personal del sistema (cajeros y encargados) también son TRABAJADORES: cada uno tiene su
 * ficha en la libreta (tipo TRABAJADOR, ligada por usuario_id) para darle crédito al cobrar y
 * descontárselo en la Nómina. Si el dueño ya lo había anotado a mano con el mismo nombre, se
 * liga esa ficha en vez de crear otra. El dueño y el Soporte Técnico no son trabajadores.
 */
@Service
public class TrabajadorSyncService {

    private final UsuarioRepository usuarios;
    private final ClienteRepository clientes;

    public TrabajadorSyncService(UsuarioRepository usuarios, ClienteRepository clientes) {
        this.usuarios = usuarios;
        this.clientes = clientes;
    }

    @Transactional
    public void asegurar() {
        Long negocioId = NegocioContext.require();
        List<Cliente> todos = new java.util.ArrayList<>(clientes.findAllByOrderByNombreAsc());
        for (Usuario u : usuarios.findAll()) {
            if (!u.isActivo() || u.isEsSoporte() || (u.getRol() != RolUsuario.CAJERO && u.getRol() != RolUsuario.ENCARGADO)) {
                continue;
            }
            if (todos.stream().anyMatch(c -> u.getId().equals(c.getUsuarioId()))) {
                continue;
            }
            String nombre = u.getNombreCompleto() == null ? "" : u.getNombreCompleto().trim();
            if (nombre.isEmpty()) {
                continue;
            }
            Cliente c = todos.stream()
                    .filter(x -> x.getUsuarioId() == null && "TRABAJADOR".equals(x.getTipo())
                            && x.getNombre().trim().toLowerCase(Locale.ROOT).equals(nombre.toLowerCase(Locale.ROOT)))
                    .findFirst().orElse(null);
            if (c == null) {
                c = new Cliente();
                c.setNegocioId(negocioId);
                c.setNombre(nombre.length() > 120 ? nombre.substring(0, 120) : nombre);
                c.setTipo("TRABAJADOR");
                todos.add(c);
            }
            c.setUsuarioId(u.getId());
            clientes.save(c);
        }
    }
}
