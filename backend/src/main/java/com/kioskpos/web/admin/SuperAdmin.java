package com.kioskpos.web.admin;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * El super admin (uriel): identidad GLOBAL, no pertenece a ningún negocio. Tabla sin
 * RLS. La verificación en dos pasos (2FA, CLAUDE.md §4) queda pendiente.
 */
@Entity
@Table(name = "super_admins")
@Getter
@Setter
@NoArgsConstructor
public class SuperAdmin {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(nullable = false, length = 150)
    private String nombre;

    @Column(nullable = false)
    private boolean activo = true;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
