package com.kioskpos.web.auth;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocalRepository extends JpaRepository<Local, Long> {
    List<Local> findByActivoTrue();
}
