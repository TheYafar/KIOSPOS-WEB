package com.kioskpos.web.admin;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Crea el PRIMER super admin al arrancar, SOLO si se entregan credenciales por
 * variables de entorno (KIOSKPOS_BOOTSTRAP_SUPERADMIN_EMAIL / _PASSWORD) y aún no
 * existe ninguno. Sin valores por defecto a propósito: nada de cuentas admin ocultas
 * con contraseña conocida (CLAUDE.md §9). En producción se corre una vez con las
 * variables puestas y luego se quitan.
 */
@Component
public class SuperAdminSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SuperAdminSeeder.class);

    private final SuperAdminService superAdminService;
    private final String email;
    private final String password;
    private final String nombre;

    public SuperAdminSeeder(SuperAdminService superAdminService,
                            @Value("${kioskpos.bootstrap.super-admin-email:}") String email,
                            @Value("${kioskpos.bootstrap.super-admin-password:}") String password,
                            @Value("${kioskpos.bootstrap.super-admin-nombre:uriel}") String nombre) {
        this.superAdminService = superAdminService;
        this.email = email;
        this.password = password;
        this.nombre = nombre;
    }

    @Override
    public void run(String... args) {
        if (email.isBlank() || password.isBlank()) {
            return;
        }
        if (superAdminService.cuantos() > 0) {
            return;
        }
        superAdminService.crear(email, password, nombre);
        log.info("Super admin inicial creado para {}", email);
    }
}
