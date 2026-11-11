package com.kioskpos.web.suscripcion;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Catálogo de planes (lo leen el dueño al elegir y el super admin al dar de alta). */
@RestController
public class PlanController {

    @GetMapping("/api/planes")
    public List<PlanCatalogo.Plan> planes() {
        return PlanCatalogo.PLANES;
    }
}
