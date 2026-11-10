package com.kioskpos.web.auth.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, JwtService jwtService) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Públicos: el login de dueño/cajero, el login de super admin,
                        // los endpoints que se autentican con el token de la caja, y salud.
                        .requestMatchers("/api/auth/**", "/api/caja/**").permitAll()
                        .requestMatchers("/api/admin/login").permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        // Tasa BCV del día: pública (la lee la pantalla de caja antes de iniciar sesión).
                        .requestMatchers(HttpMethod.GET, "/api/tasa").permitAll()
                        // Panel de super admin.
                        .requestMatchers("/api/admin/**").hasRole("SUPER_ADMIN")
                        // Crear cajas/usuarios y reportar pagos: solo dueño o encargado.
                        .requestMatchers(HttpMethod.POST, "/api/cajas").hasAnyRole("DUENO", "ENCARGADO")
                        .requestMatchers(HttpMethod.POST, "/api/usuarios").hasAnyRole("DUENO", "ENCARGADO")
                        .requestMatchers(HttpMethod.POST, "/api/mi-negocio/pagos").hasAnyRole("DUENO", "ENCARGADO")
                        // Editar config del negocio: solo dueño/encargado (el GET lo lee el cajero).
                        .requestMatchers(HttpMethod.PUT, "/api/mi-negocio/config").hasAnyRole("DUENO", "ENCARGADO")
                        .requestMatchers(HttpMethod.PUT, "/api/mi-negocio/caja-config").hasAnyRole("DUENO", "ENCARGADO")
                        // Fiado: cambiar límite / desactivar un cliente, solo dueño o encargado.
                        .requestMatchers(HttpMethod.PUT, "/api/clientes/**").hasAnyRole("DUENO", "ENCARGADO")
                        .requestMatchers(HttpMethod.POST, "/api/clientes/*/descuento-sueldo").hasAnyRole("DUENO", "ENCARGADO")
                        // Compras y proveedores: solo dueño o encargado.
                        .requestMatchers("/api/compras/**", "/api/proveedores/**").hasAnyRole("DUENO", "ENCARGADO")
                        // Inventario: leer lo puede todo usuario; crear/editar/borrar/importar solo dueño/encargado.
                        .requestMatchers(HttpMethod.POST, "/api/inventario/**").hasAnyRole("DUENO", "ENCARGADO")
                        .requestMatchers(HttpMethod.PUT, "/api/inventario/**").hasAnyRole("DUENO", "ENCARGADO")
                        .requestMatchers(HttpMethod.DELETE, "/api/inventario/**").hasAnyRole("DUENO", "ENCARGADO")
                        .anyRequest().authenticated())
                .addFilterBefore(new JwtAuthFilter(jwtService), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
