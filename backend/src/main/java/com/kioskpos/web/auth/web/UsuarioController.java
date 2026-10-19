package com.kioskpos.web.auth.web;

import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.Usuario;
import com.kioskpos.web.auth.UsuarioService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/usuarios")
public class UsuarioController {

    private final UsuarioService usuarioService;

    public UsuarioController(UsuarioService usuarioService) {
        this.usuarioService = usuarioService;
    }

    @PostMapping
    public UsuarioResponse crear(@RequestBody CrearUsuarioRequest req) {
        Usuario u = req.rol() == RolUsuario.CAJERO
                ? usuarioService.crearCajero(req.nombreCompleto(), req.pin())
                : usuarioService.crearConCorreo(req.nombreCompleto(), req.rol(), req.email(), req.password());
        return UsuarioResponse.de(u);
    }

    @GetMapping
    public List<UsuarioResponse> listar() {
        return usuarioService.listar().stream().map(UsuarioResponse::de).toList();
    }

    public record CrearUsuarioRequest(
            @NotNull RolUsuario rol,
            @NotBlank String nombreCompleto,
            String email,
            String password,
            String pin) {
    }

    public record UsuarioResponse(Long id, String nombreCompleto, RolUsuario rol,
                                  boolean activo, boolean esSoporte) {
        static UsuarioResponse de(Usuario u) {
            return new UsuarioResponse(u.getId(), u.getNombreCompleto(), u.getRol(),
                    u.isActivo(), u.isEsSoporte());
        }
    }
}
