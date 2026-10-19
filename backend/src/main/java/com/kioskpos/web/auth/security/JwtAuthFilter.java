package com.kioskpos.web.auth.security;

import com.kioskpos.web.tenant.NegocioContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Lee el Bearer JWT, lo valida y fija la identidad de la petición:
 *  - el {@link KioskPrincipal} en el SecurityContext (con authority ROLE_&lt;rol&gt;),
 *  - el negocio_id en {@link NegocioContext}, que es lo que activa la barrera de
 *    base de datos (Row Level Security) en cada transacción de esta petición.
 *
 * Siempre limpia NegocioContext al terminar (es un ThreadLocal y el hilo se reutiliza).
 * Un token ausente o inválido no se rechaza aquí: se deja pasar sin autenticar y es
 * la configuración de seguridad la que decide si el endpoint requería sesión.
 */
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    public JwtAuthFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        boolean contextSet = false;
        if (header != null && header.startsWith("Bearer ")) {
            try {
                KioskPrincipal p = jwtService.validar(header.substring(7));
                var auth = new UsernamePasswordAuthenticationToken(
                        p, null, List.of(new SimpleGrantedAuthority("ROLE_" + p.rol().name())));
                SecurityContextHolder.getContext().setAuthentication(auth);
                NegocioContext.set(p.negocioId());
                contextSet = true;
            } catch (Exception e) {
                SecurityContextHolder.clearContext();
            }
        }
        try {
            chain.doFilter(request, response);
        } finally {
            if (contextSet) {
                NegocioContext.clear();
            }
        }
    }
}
