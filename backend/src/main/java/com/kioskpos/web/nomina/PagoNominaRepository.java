package com.kioskpos.web.nomina;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PagoNominaRepository extends JpaRepository<PagoNomina, Long> {
    List<PagoNomina> findTop300ByOrderByCreatedAtDescIdDesc();

    List<PagoNomina> findByTrabajadorIdOrderByCreatedAtDescIdDesc(Long trabajadorId);
}
