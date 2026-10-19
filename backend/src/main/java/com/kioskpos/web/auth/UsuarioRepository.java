package com.kioskpos.web.auth;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UsuarioRepository extends JpaRepository<Usuario, Long> {
    List<Usuario> findByActivoTrue();
    List<Usuario> findByRolAndActivoTrue(RolUsuario rol);
    long countByRolAndActivoTrue(RolUsuario rol);
}
