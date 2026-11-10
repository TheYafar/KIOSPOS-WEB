package com.kioskpos.web;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Base de las pruebas de integración: un único Postgres 16 real (Testcontainers),
 * compartido entre todas las clases de prueba (patrón singleton — se arranca una vez
 * y Ryuk lo limpia al terminar la JVM).
 *
 * El datasource de runtime se conecta como {@code kioskpos_app} (rol limitado creado
 * por db/init/01-create-app-role.sql), igual que en dev/producción: así Row Level
 * Security se ejerce de verdad. Flyway usa el rol administrativo.
 */
public abstract class PostgresRlsTestBase {

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16")
            .withDatabaseName("kioskpos")
            .withUsername("kioskpos_admin")
            .withPassword("kioskpos_admin_dev")
            .withInitScript("db/init/01-create-app-role.sql");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void propiedades(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", () -> "kioskpos_app");
        registry.add("spring.datasource.password", () -> "kioskpos_app_dev");
        registry.add("spring.flyway.url", POSTGRES::getJdbcUrl);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
        // Las pruebas nunca salen a internet: la API de la tasa BCV apunta a un puerto cerrado.
        registry.add("kioskpos.tasa.url", () -> "http://127.0.0.1:9/sin-red");
    }
}
