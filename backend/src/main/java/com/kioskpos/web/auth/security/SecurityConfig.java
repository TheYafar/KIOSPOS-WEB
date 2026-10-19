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
                        // Públicos: el propio login y los endpoints que se autentican con el
                        // token de la caja (hacen su propia verificación, no por JWT).
                        .requestMatchers("/api/auth/**", "/api/caja/**").permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        // Crear cajas y usuarios: solo dueño o encargado.
                        .requestMatchers(HttpMethod.POST, "/api/cajas").hasAnyRole("DUENO", "ENCARGADO")
                        .requestMatchers(HttpMethod.POST, "/api/usuarios").hasAnyRole("DUENO", "ENCARGADO")
                        .anyRequest().authenticated())
                .addFilterBefore(new JwtAuthFilter(jwtService), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
