package com.kioskpos.web.auth;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CajaRepository extends JpaRepository<Caja, Long> {
    List<Caja> findByActivaTrue();
}
